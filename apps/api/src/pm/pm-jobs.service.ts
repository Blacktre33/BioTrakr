import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { RETIRED_STATUSES } from '../assets/asset-status.service';
import { BIOMED_ROLES } from '../auth/roles';
import { PrismaService } from '../database/prisma.service';
import { bestEffort, deviceLabel, notify } from '../notifications/notify';
import { OPEN_STATUSES } from '../work-orders/work-orders.service';

const DAY = 24 * 60 * 60 * 1000;
const BATCH = 200;
/** A notice names this many devices, then "and N more". */
const NAMED_IN_NOTICE = 5;

/** Settings, read when used so tests and restarts pick up changes. */
export function pmConfig() {
  const lead = Number(process.env.PM_LEAD_DAYS ?? 14);
  return {
    /** Work orders open this many days before the PM falls due. */
    leadDays: Number.isInteger(lead) && lead >= 0 && lead <= 90 ? lead : 14,
  };
}

/** An open preventive maintenance work order. */
export const OPEN_PM: Prisma.MaintenanceHistoryWhereInput = {
  workOrderType: 'PREVENTIVE_MAINTENANCE',
  workOrderStatus: { in: OPEN_STATUSES },
};

/** Devices the PM schedule applies to: in service, with a due date. */
export const PM_SCHEDULED: Prisma.AssetWhereInput = {
  deletedAt: null,
  assetStatus: { notIn: RETIRED_STATUSES },
  nextPmDueDate: { not: null },
};

/** 2026-10-14, in the server's time zone (TZ: the hospital's). */
export const formatDay = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

/**
 * Opens preventive maintenance work orders ahead of their due date, so the
 * work shows up in biomed's queue in time. Runs hourly in each API instance;
 * the database allows one work order per device and due date, so several
 * instances never open the same one twice.
 */
@Injectable()
export class PmJobsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('PmSchedule');
  private timer: NodeJS.Timeout | null = null;
  private startup: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap(): void {
    if (process.env.PM_JOBS === 'off' || process.env.NODE_ENV === 'test') {
      return;
    }
    const every = Number(process.env.PM_JOB_INTERVAL_MS) || 60 * 60 * 1000;
    this.timer = setInterval(() => void this.tick(), every);
    this.timer.unref();
    // Soon after start too, rather than an hour later.
    this.startup = setTimeout(() => void this.tick(), 60_000);
    this.startup.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.startup) clearTimeout(this.startup);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.openDue();
    } catch (error) {
      this.logger.error(`PM schedule failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Opens a work order for each device whose PM falls due within the lead
   * time and has no PM work order open. A device whose PM work order for
   * this due date was cancelled is left alone: someone decided against it,
   * and it stays on the overdue list until a PM is recorded.
   */
  async openDue(
    now = new Date(),
    organizationId?: string,
  ): Promise<{ opened: number }> {
    const { leadDays } = pmConfig();
    const horizon = new Date(now.getTime() + leadDays * DAY);
    let opened = 0;
    let after: string | undefined;

    for (;;) {
      const due = await this.prisma.asset.findMany({
        where: {
          ...PM_SCHEDULED,
          ...(organizationId ? { organizationId } : {}),
          autoGenerateWorkOrders: true,
          nextPmDueDate: { lte: horizon },
          maintenanceHistory: { none: OPEN_PM },
          ...(after ? { id: { gt: after } } : {}),
        },
        select: {
          id: true,
          organizationId: true,
          currentFacilityId: true,
          assetTagNumber: true,
          equipmentName: true,
          nextPmDueDate: true,
          pmProcedureDocument: true,
        },
        orderBy: { id: 'asc' },
        take: BATCH,
      });
      if (due.length === 0) break;
      after = due[due.length - 1].id;

      opened += await this.prisma.$transaction(async (tx) => {
        const created = await tx.maintenanceHistory.createManyAndReturn({
          data: due.map((asset) => ({
            assetId: asset.id,
            workOrderType: 'PREVENTIVE_MAINTENANCE' as const,
            workOrderStatus: 'PENDING' as const,
            scheduledDate: asset.nextPmDueDate!,
            pmDueDate: asset.nextPmDueDate!,
            description: [
              `Preventive maintenance due ${formatDay(asset.nextPmDueDate!)}`,
              asset.pmProcedureDocument
                ? `Procedure: ${asset.pmProcedureDocument}`
                : null,
            ]
              .filter(Boolean)
              .join('\n'),
            createdByUserId: null,
          })),
          // Already opened (by another instance, or cancelled): skipped.
          skipDuplicates: true,
          select: { id: true, assetId: true },
        });
        if (created.length) {
          await bestEffort(tx, 'PM notices', () =>
            this.notice(tx, due, created),
          );
        }
        return created.length;
      });
      if (due.length < BATCH) break;
    }
    if (opened) this.logger.log(`Opened ${opened} PM work order(s)`);
    return { opened };
  }

  /** One notice per facility for each batch, not one per device. */
  private async notice(
    tx: Prisma.TransactionClient,
    due: Array<{
      id: string;
      organizationId: string;
      currentFacilityId: string;
      assetTagNumber: string;
      equipmentName: string;
    }>,
    created: Array<{ id: string; assetId: string }>,
  ) {
    const byAsset = new Map(due.map((a) => [a.id, a]));
    const groups = new Map<
      string,
      Array<{ workOrderId: string; asset: (typeof due)[number] }>
    >();
    for (const wo of created) {
      const asset = byAsset.get(wo.assetId)!;
      const key = `${asset.organizationId}|${asset.currentFacilityId}`;
      groups.set(key, [
        ...(groups.get(key) ?? []),
        { workOrderId: wo.id, asset },
      ]);
    }
    for (const group of groups.values()) {
      const [first] = group;
      const names = group
        .slice(0, NAMED_IN_NOTICE)
        .map((g) => deviceLabel(g.asset));
      const more = group.length - names.length;
      await notify(tx, {
        organizationId: first.asset.organizationId,
        kind: 'pm_due',
        severity: 'info',
        title:
          group.length === 1
            ? `PM due: ${deviceLabel(first.asset)}`
            : `${group.length} preventive maintenance jobs opened`,
        body: [...names, more > 0 ? `and ${more} more` : null]
          .filter(Boolean)
          .join('\n'),
        link: '/maintenance/schedule',
        assetId: group.length === 1 ? first.asset.id : undefined,
        workOrderId: group.length === 1 ? first.workOrderId : undefined,
        to: { roles: BIOMED_ROLES, facilityId: first.asset.currentFacilityId },
        dedupeKey: `pm-opened:${first.workOrderId}`,
      });
    }
  }
}
