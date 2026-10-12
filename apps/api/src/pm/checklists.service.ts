import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import {
  actorOf,
  audit,
  auditedTransaction,
  type Change,
} from '../audit/audit';
import { changesBetween } from '../audit/changes';
import type { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import {
  BUILT_IN_CHECKLISTS,
  checklistFor,
  checklistProblems,
  type ChecklistItem,
} from './checklists';
import { toDef } from './pm-record';
import type { ChecklistInputDto, UpdateChecklistDto } from './pm.dto';

/** Only what was given: empty limits and units are left out. */
function cleanItems(items: ChecklistInputDto['items']): ChecklistItem[] {
  return items.map((i) => ({
    key: i.key,
    text: i.text.trim(),
    kind: i.kind,
    ...(i.unit?.trim() ? { unit: i.unit.trim() } : {}),
    ...(i.min !== undefined ? { min: i.min } : {}),
    ...(i.max !== undefined ? { max: i.max } : {}),
  }));
}

const cleanKeywords = (words: string[]) => [
  ...new Set(words.map((w) => w.trim().toLowerCase()).filter(Boolean)),
];

const RECORD_SELECT = {
  id: true,
  workOrderId: true,
  checklistKey: true,
  checklistName: true,
  items: true,
  outcome: true,
  testEquipment: true,
  recordedAt: true,
  recordedBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.PmChecklistRecordSelect;

/**
 * The checklists biomed works through at each preventive maintenance: the
 * built-in ones and the hospital's own, and what each PM found.
 */
@Injectable()
export class ChecklistsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every checklist, and the one that suits a device when asked. */
  async list(user: AuthUser, assetId?: string) {
    const rows = await this.prisma.pmChecklistTemplate.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        keywords: true,
        items: true,
        active: true,
        updatedAt: true,
      },
    });
    const own = rows.map((r) => ({ ...toDef(r), active: r.active }));
    let suggested: string | null = null;
    if (assetId) {
      const asset = await this.prisma.asset.findFirst({
        where: {
          id: assetId,
          organizationId: user.organizationId,
          deletedAt: null,
        },
        select: { equipmentName: true },
      });
      if (!asset) throw new NotFoundException('Device not found');
      suggested = checklistFor(
        asset.equipmentName,
        own.filter((c) => c.active),
      ).key;
    }
    return {
      checklists: [
        ...own,
        ...BUILT_IN_CHECKLISTS.map((c) => ({ ...c, active: true })),
      ],
      suggested,
    };
  }

  async create(dto: ChecklistInputDto, user: AuthUser) {
    const items = cleanItems(dto.items);
    const problems = checklistProblems({ name: dto.name, items });
    if (problems.length) throw new BadRequestException(problems);
    try {
      return await auditedTransaction(this.prisma, async (tx) => {
        const row = await tx.pmChecklistTemplate.create({
          data: {
            organizationId: user.organizationId,
            name: dto.name.trim(),
            keywords: cleanKeywords(dto.keywords),
            items: items as unknown as Prisma.InputJsonValue,
          },
          select: {
            id: true,
            name: true,
            keywords: true,
            items: true,
            active: true,
          },
        });
        audit(tx, actorOf(user), {
          action: 'checklist.created',
          entityType: 'checklist',
          entityId: row.id,
          summary: `Added the PM checklist ${row.name} (${items.length} items)`,
        });
        return { ...toDef(row), active: row.active };
      });
    } catch (error) {
      throw this.duplicate(error);
    }
  }

  async update(id: string, dto: UpdateChecklistDto, user: AuthUser) {
    const items = cleanItems(dto.items);
    const problems = checklistProblems({ name: dto.name, items });
    if (problems.length) throw new BadRequestException(problems);
    try {
      return await auditedTransaction(this.prisma, async (tx) => {
        const where = { id, organizationId: user.organizationId };
        const before = await tx.pmChecklistTemplate.findFirst({
          where,
          select: { name: true, keywords: true, items: true, active: true },
        });
        if (!before) throw new NotFoundException('Checklist not found');
        const data = {
          name: dto.name.trim(),
          keywords: cleanKeywords(dto.keywords),
          items: items as unknown as Prisma.InputJsonValue,
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        };
        await tx.pmChecklistTemplate.updateMany({ where, data });
        const changes: Change[] = await changesBetween(
          tx,
          {
            name: before.name,
            keywords: before.keywords,
            active: before.active,
          },
          { name: data.name, keywords: data.keywords, active: dto.active },
        );
        const was = before.items as unknown as ChecklistItem[];
        if (JSON.stringify(was) !== JSON.stringify(items)) {
          changes.push({
            field: 'items',
            label: 'Items',
            from: `${was.length} items`,
            to: `${items.length} items (edited)`,
          });
        }
        if (changes.length) {
          audit(tx, actorOf(user), {
            action: 'checklist.updated',
            entityType: 'checklist',
            entityId: id,
            summary: `Edited the PM checklist ${before.name}`,
            changes,
          });
        }
        const row = await tx.pmChecklistTemplate.findFirst({
          where,
          select: {
            id: true,
            name: true,
            keywords: true,
            items: true,
            active: true,
          },
        });
        return { ...toDef(row!), active: row!.active };
      });
    } catch (error) {
      throw this.duplicate(error);
    }
  }

  /** What each PM of a device found, newest first. */
  async records(assetId: string, user: AuthUser) {
    const asset = await this.prisma.asset.findFirst({
      where: {
        id: assetId,
        organizationId: user.organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!asset) throw new NotFoundException('Device not found');
    const rows = await this.prisma.pmChecklistRecord.findMany({
      where: { assetId },
      orderBy: { recordedAt: 'desc' },
      take: 50,
      select: RECORD_SELECT,
    });
    return rows.map(({ recordedBy, ...r }) => ({
      ...r,
      recordedBy: `${recordedBy.firstName} ${recordedBy.lastName}`.trim(),
    }));
  }

  private duplicate(error: unknown) {
    return (error as { code?: string }).code === 'P2002'
      ? new ConflictException('Another checklist already has this name')
      : error;
  }
}
