import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import type { Prisma, WorkOrderStatus } from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { jobFailed, jobSucceeded, registerJob } from '../system/job-health';
import {
  emailConfig,
  sendEmail,
  sendSms,
  sendWebhook,
  smsConfig,
  type SendResult,
} from './channels';

export { signWebhook } from './channels';
import {
  deviceLabel,
  escalationLevel,
  formatMinutes,
  notificationConfig,
  notify,
} from './notify';

/** Its name on Settings → System. */
export const NOTIFY_JOB = 'Escalations and outside messages';
/** Urgent work orders are escalated until one of these moves them on. */
const NOT_STARTED: WorkOrderStatus[] = ['PENDING', 'ASSIGNED'];
/** Only fairly recent reports are escalated (not a backlog found on first start). */
const ESCALATION_WINDOW_MS = 24 * 60 * 60 * 1000;
/** A claimed message is this instance's for this long; far above one send (10 s). */
const LEASE_MS = 2 * 60 * 1000;
export const MAX_ATTEMPTS = 8;
/** In-app notices are kept this long; outside messages a week after they finish. */
export const KEEP_NOTICES_DAYS = 90;
export const KEEP_OUTBOUND_DAYS = 7;
const PRUNE_EVERY_MS = 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

/** 30 s, 1, 2, 4… minutes, capped at an hour. */
export function retryDelayMs(attempts: number): number {
  return Math.min(60 * 60 * 1000, 30_000 * 2 ** Math.max(0, attempts - 1));
}

/** The channel was switched off after the message was queued: not retried. */
const off = (error: string): SendResult => ({
  ok: false,
  permanent: true,
  error,
});

/**
 * Work that happens without anyone clicking: escalating urgent problem
 * reports nobody has taken on, delivering outbound messages, and pruning
 * old notices. Runs every 30 s in each API instance (it needs a long-lived
 * process, not a serverless function); claims keep instances from doing
 * the same work twice.
 */
@Injectable()
export class NotificationJobsService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger('Notifications');
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastPrune = 0;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap(): void {
    if (process.env.NOTIFY_JOBS === 'off' || process.env.NODE_ENV === 'test') {
      return;
    }
    const every = Number(process.env.NOTIFY_JOB_INTERVAL_MS) || 30_000;
    registerJob(NOTIFY_JOB, every);
    this.timer = setInterval(() => void this.tick(), every);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One pass of the jobs. Overlapping passes are skipped. */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.escalate();
      await this.deliver();
      if (Date.now() - this.lastPrune > PRUNE_EVERY_MS) {
        this.lastPrune = Date.now();
        await this.prune();
      }
      jobSucceeded(NOTIFY_JOB);
    } catch (error) {
      jobFailed(NOTIFY_JOB, error);
      this.logger.error(`Notification job failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * An urgent report (a life-saving device out of use) that nobody has
   * started on goes to the engineers and administrators, and to whoever it
   * is assigned to, inside and outside the app: after each configured step
   * (15 and 60 minutes by default), then again every
   * NOTIFY_ESCALATE_REPEAT_MINUTES until work starts. Each step is claimed
   * on the work order, so it happens once even with several API instances.
   */
  async escalate(now = new Date()): Promise<number> {
    const { escalateAfterMinutes: steps, escalateRepeatMinutes: repeat } =
      notificationConfig();
    const waiting = await this.prisma.maintenanceHistory.findMany({
      where: {
        isEmergency: true,
        workOrderType: 'CORRECTIVE_MAINTENANCE',
        workOrderStatus: { in: NOT_STARTED },
        createdAt: {
          lte: new Date(now.getTime() - steps[0] * 60_000),
          gte: new Date(now.getTime() - ESCALATION_WINDOW_MS),
        },
        asset: { deletedAt: null },
      },
      select: {
        id: true,
        createdAt: true,
        escalatedAfterMinutes: true,
        assignedTechnicianId: true,
        assignedTechnician: { select: { firstName: true, lastName: true } },
        asset: {
          select: {
            id: true,
            organizationId: true,
            currentFacilityId: true,
            assetTagNumber: true,
            equipmentName: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    let sent = 0;
    for (const wo of waiting) {
      // After downtime, a report due for several steps gets one message.
      const minutes = escalationLevel(
        Math.floor((now.getTime() - wo.createdAt.getTime()) / 60_000),
        steps,
        repeat,
      );
      if (minutes === null || (wo.escalatedAfterMinutes ?? 0) >= minutes) {
        continue;
      }
      await this.prisma.$transaction(async (tx) => {
        // Claim this step; also skips it if work started meanwhile.
        const { count } = await tx.maintenanceHistory.updateMany({
          where: {
            id: wo.id,
            workOrderStatus: { in: NOT_STARTED },
            OR: [
              { escalatedAfterMinutes: null },
              { escalatedAfterMinutes: { lt: minutes } },
            ],
          },
          data: { escalatedAfterMinutes: minutes },
        });
        if (count === 0) return;
        const assignee = wo.assignedTechnician
          ? `${wo.assignedTechnician.firstName} ${wo.assignedTechnician.lastName}`.trim()
          : null;
        const notice = {
          organizationId: wo.asset.organizationId,
          kind: 'escalation' as const,
          severity: 'critical' as const,
          title: assignee
            ? `Not started ${formatMinutes(minutes)} after it was reported: ${deviceLabel(wo.asset)} (assigned to ${assignee})`
            : `Nobody has taken this on for ${formatMinutes(minutes)}: ${deviceLabel(wo.asset)}`,
          link: '/maintenance',
          assetId: wo.asset.id,
          workOrderId: wo.id,
          dedupeKey: `escalation:${minutes}:${wo.id}`,
          outbound: true,
        };
        let reached = await notify(tx, {
          ...notice,
          to: {
            roles: ['admin', 'engineer'],
            facilityId: wo.asset.currentFacilityId,
          },
        });
        if (wo.assignedTechnicianId) {
          reached += await notify(tx, {
            ...notice,
            to: { userIds: [wo.assignedTechnicianId] },
          });
        }
        // Nobody for that facility: tell every administrator.
        if (reached === 0) {
          await notify(tx, { ...notice, to: { roles: ['admin'] } });
        }
        sent++;
      });
    }
    if (sent)
      this.logger.warn(`Escalated ${sent} urgent report(s) not yet started`);
    return sent;
  }

  /**
   * Sends due outbound messages, retrying failures with backoff. `now`
   * picks which messages are due; each one is then timed on its own, so a
   * slow gateway cannot make later messages' leases or signatures stale.
   */
  async deliver(now = new Date()): Promise<{ sent: number; failed: number }> {
    const clock = () => new Date(Math.max(Date.now(), now.getTime()));
    const due = await this.prisma.outboundMessage.findMany({
      where: { sentAt: null, failedAt: null, nextAttemptAt: { lte: now } },
      orderBy: { nextAttemptAt: 'asc' },
      take: 50,
      select: {
        id: true,
        channel: true,
        nextAttemptAt: true,
        attempts: true,
        payload: true,
      },
    });
    let sent = 0;
    let failed = 0;
    for (const message of due) {
      // Claim it: of several API instances, only one sends each message.
      const lease = new Date(clock().getTime() + LEASE_MS);
      const { count } = await this.prisma.outboundMessage.updateMany({
        where: {
          id: message.id,
          sentAt: null,
          failedAt: null,
          nextAttemptAt: message.nextAttemptAt,
        },
        data: { nextAttemptAt: lease, attempts: { increment: 1 } },
      });
      if (count === 0) continue;
      const attempts = message.attempts + 1;

      const result = await this.send(message, clock());

      const finished = clock();
      const giveUp =
        !result.ok && (result.permanent || attempts >= MAX_ATTEMPTS);
      const data: Prisma.OutboundMessageUpdateManyMutationInput = result.ok
        ? { sentAt: finished, lastError: null }
        : giveUp
          ? {
              failedAt: finished,
              lastError: (result.error ?? 'failed').slice(0, 500),
            }
          : {
              nextAttemptAt: new Date(
                finished.getTime() + retryDelayMs(attempts),
              ),
              lastError: (result.error ?? 'failed').slice(0, 500),
            };
      // Only if the claim is still ours (it could have expired and been taken).
      const { count: saved } = await this.prisma.outboundMessage.updateMany({
        where: {
          id: message.id,
          nextAttemptAt: lease,
          sentAt: null,
          failedAt: null,
        },
        data,
      });
      if (!saved) {
        this.logger.warn(
          `Outbound message ${message.id}: claim expired during send`,
        );
        continue;
      }
      if (result.ok) sent++;
      else if (giveUp) {
        failed++;
        this.logger.error(
          `Gave up on outbound message ${message.id} after ${attempts} attempt(s): ${result.error ?? 'failed'}`,
        );
      }
    }
    return { sent, failed };
  }

  /** Old notices and finished outside messages (which name staff and their phones) are deleted. */
  async prune(
    now = new Date(),
  ): Promise<{ notices: number; outbound: number }> {
    const notices = await this.prisma.notification.deleteMany({
      where: {
        createdAt: { lt: new Date(now.getTime() - KEEP_NOTICES_DAYS * DAY) },
      },
    });
    const cutoff = new Date(now.getTime() - KEEP_OUTBOUND_DAYS * DAY);
    const outbound = await this.prisma.outboundMessage.deleteMany({
      where: { OR: [{ sentAt: { lt: cutoff } }, { failedAt: { lt: cutoff } }] },
    });
    return { notices: notices.count, outbound: outbound.count };
  }

  /** Sends one queued message through its channel, as set up now. */
  private async send(
    message: { id: string; channel: string; payload: Prisma.JsonValue },
    at: Date,
  ): Promise<SendResult> {
    const payload = (message.payload ?? {}) as Record<string, unknown>;
    switch (message.channel) {
      case 'webhook': {
        const config = notificationConfig();
        return config.webhookUrl && config.webhookSecret
          ? sendWebhook(
              config.webhookUrl,
              config.webhookSecret,
              message.id,
              message.payload,
              at,
            )
          : off(
              'No webhook is configured (NOTIFY_WEBHOOK_URL and NOTIFY_WEBHOOK_SECRET)',
            );
      }
      case 'email': {
        const config = emailConfig();
        return config
          ? sendEmail(config, {
              to: String(payload.to),
              subject: String(payload.subject),
              text: String(payload.text),
            })
          : off('Email is not set up (SMTP_HOST and NOTIFY_EMAIL_FROM)');
      }
      case 'sms': {
        const config = smsConfig();
        return config
          ? sendSms(config, String(payload.to), String(payload.text))
          : off('SMS is not set up (NOTIFY_SMS_URL)');
      }
      default:
        return off(`Unknown channel "${message.channel}"`);
    }
  }
}
