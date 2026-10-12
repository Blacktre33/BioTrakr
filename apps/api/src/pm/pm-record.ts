import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { takeOutOfUseAfterFailedCheck } from '../assets/failed-check';
import { audit, type Actor } from '../audit/audit';
import { isLifeSaving } from '../downtime/downtime';
import {
  BUILT_IN_CHECKLISTS,
  evaluateChecklist,
  type AnsweredItem,
  type ChecklistDef,
  type ChecklistItem,
} from './checklists';
import type { PmChecklistInputDto } from './pm.dto';

type Tx = Prisma.TransactionClient;

/** A hospital checklist row as the checklist logic sees it. */
export const toDef = (row: {
  id: string;
  name: string;
  keywords: string[];
  items: Prisma.JsonValue;
}): ChecklistDef => ({
  key: row.id,
  name: row.name,
  keywords: row.keywords,
  items: row.items as unknown as ChecklistItem[],
  builtIn: false,
});

/** A checklist by key: built-in, or one of the hospital's still offered. */
export async function findChecklist(
  tx: Pick<Tx, 'pmChecklistTemplate'>,
  organizationId: string,
  key: string,
): Promise<ChecklistDef | null> {
  if (key.startsWith('builtin:')) {
    return BUILT_IN_CHECKLISTS.find((c) => c.key === key) ?? null;
  }
  const row = await tx.pmChecklistTemplate.findFirst({
    where: { id: key, organizationId, active: true },
    select: { id: true, name: true, keywords: true, items: true },
  });
  return row ? toDef(row) : null;
}

/**
 * Checks a completed checklist before anything is written: the checklist
 * exists and every item is answered. Returns it evaluated.
 */
export async function checkPmChecklist(
  tx: Tx,
  organizationId: string,
  input: PmChecklistInputDto,
) {
  const checklist = await findChecklist(tx, organizationId, input.checklistKey);
  if (!checklist) {
    throw new BadRequestException([
      'That checklist is no longer offered. Reload and choose another.',
    ]);
  }
  const evaluation = evaluateChecklist(checklist, input.items);
  if (evaluation.problems.length) {
    throw new BadRequestException(evaluation.problems);
  }
  return { checklist, ...evaluation };
}

const listItems = (items: AnsweredItem[]) =>
  items.map((i) => `${i.text}${i.note ? `: ${i.note}` : ''}`).join('; ');

/**
 * Records what a PM found, in the caller's (audited) transaction. A failed
 * item takes the device out of use and opens a repair for it; flagged
 * items stay on record for the next visit.
 */
export async function recordPmChecklist(
  tx: Tx,
  e: {
    workOrderId: string;
    assetId: string;
    actor: Actor;
    input: PmChecklistInputDto;
    checked: Awaited<ReturnType<typeof checkPmChecklist>>;
  },
) {
  const { checklist, items, outcome } = e.checked;
  const record = await tx.pmChecklistRecord.create({
    data: {
      workOrderId: e.workOrderId,
      assetId: e.assetId,
      checklistKey: checklist.key,
      checklistName: checklist.name,
      items: items as unknown as Prisma.InputJsonValue,
      outcome,
      testEquipment: e.input.testEquipment?.trim() || null,
      recordedById: e.actor.userId!,
    },
    select: { id: true },
  });

  const device = await tx.asset.findFirst({
    where: { id: e.assetId, organizationId: e.actor.organizationId },
    select: {
      assetTagNumber: true,
      criticalityLevel: true,
      deviceCategory: true,
    },
  });
  const tag = device?.assetTagNumber ?? 'the device';
  const failed = items.filter((i) => i.result === 'FAIL');
  const flagged = items.filter((i) => i.result === 'FLAG');
  audit(tx, e.actor, {
    action: 'pm_checklist.recorded',
    entityType: 'pm_checklist',
    entityId: record.id,
    assetId: e.assetId,
    summary:
      outcome === 'FAIL'
        ? `PM of ${tag} failed (${checklist.name}): ${failed.map((i) => i.text).join('; ')}`
        : outcome === 'FLAG'
          ? `PM of ${tag} passed with ${flagged.length} flagged (${checklist.name})`
          : `PM of ${tag} passed (${checklist.name})`,
    reason:
      failed.length || flagged.length
        ? listItems([...failed, ...flagged])
        : null,
  });

  if (outcome === 'FAIL') {
    const details = listItems(failed);
    await takeOutOfUseAfterFailedCheck(tx, {
      assetId: e.assetId,
      actor: e.actor,
      workOrderId: e.workOrderId,
      what: 'Failed preventive maintenance',
      details,
      until: 'the fault is repaired',
      kind: 'pm_failed',
    });
    // The fault found is a breakdown: repaired and timed like any other.
    const repair = await tx.maintenanceHistory.create({
      data: {
        assetId: e.assetId,
        workOrderType: 'CORRECTIVE_MAINTENANCE',
        workOrderStatus: 'PENDING',
        scheduledDate: new Date(),
        description: `Fault found at preventive maintenance: ${details}`.slice(
          0,
          4000,
        ),
        isEmergency: device ? isLifeSaving(device) : false,
        createdByUserId: e.actor.userId,
      },
      select: { id: true },
    });
    audit(tx, e.actor, {
      action: 'work_order.reported',
      entityType: 'work_order',
      entityId: repair.id,
      assetId: e.assetId,
      summary: `Repair opened for faults found at the PM of ${tag}`,
      reason: details,
    });
  }
  return { id: record.id, outcome };
}
