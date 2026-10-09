import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createHmac } from 'crypto';

import { PrismaService } from '../database/prisma.service';
import { deviceLabel, notificationConfig, notify } from './notify';

/** Only fairly recent reports are escalated (not a backlog found on first start). */
const ESCALATION_WINDOW_MS = 24 * 60 * 60 * 1000;
/** A claimed message is this instance's for this long; far above one send (10 s). */
const LEASE_MS = 2 * 60 * 1000;
export const MAX_ATTEMPTS = 8;
const TIMEOUT_MS = 10_000;
/** In-app notices are kept this long; outside messages a week after they finish. */
export const KEEP_NOTICES_DAYS = 90;
export const KEEP_OUTBOUND_DAYS = 7;
const PRUNE_EVERY_MS = 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

/** 30 s, 1, 2, 4… minutes, capped at an hour. */
export function retryDelayMs(attempts: number): number {
  return Math.min(60 * 60 * 1000, 30_000 * 2 ** Math.max(0, attempts - 1));
}

/** Header value a receiver recomputes to check a message really came from BioTrakr. */
export function signWebhook(secret: string, timestamp: number, body: string) {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

/** Retrying will not help: the gateway refused the request itself. */
const permanent = (status: number) =>
  (status >= 300 && status < 400) ||
  (status >= 400 && status < 500 && status !== 408 && status !== 429);

/** error is set whenever ok is false. */
type SendResult = { ok: boolean; error?: string; permanent?: boolean };

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
    } catch (error) {
      this.logger.error(`Notification job failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * An emergency report (a high-risk device taken out of use) still
   * unassigned after 15 and again after 60 minutes goes to the engineers
   * and administrators, and outside the app. Each level is claimed on the
   * work order, so it happens once even with several API instances.
   */
  async escalate(now = new Date()): Promise<number> {
    const { escalateAfterMinutes } = notificationConfig();
    let sent = 0;
    // Latest level first: after downtime, a report due for both 15 and 60
    // minutes gets one message, not two.
    for (const minutes of [...escalateAfterMinutes].reverse()) {
      const notYet: Prisma.MaintenanceHistoryWhereInput = {
        OR: [
          { escalatedAfterMinutes: null },
          { escalatedAfterMinutes: { lt: minutes } },
        ],
      };
      const stuck = await this.prisma.maintenanceHistory.findMany({
        where: {
          isEmergency: true,
          workOrderType: 'CORRECTIVE_MAINTENANCE',
          workOrderStatus: 'PENDING',
          assignedTechnicianId: null,
          createdAt: {
            lte: new Date(now.getTime() - minutes * 60_000),
            gte: new Date(now.getTime() - ESCALATION_WINDOW_MS),
          },
          asset: { deletedAt: null },
          ...notYet,
        },
        select: {
          id: true,
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

      for (const wo of stuck) {
        await this.prisma.$transaction(async (tx) => {
          // Claim this level; also skips it if someone took the work on.
          const { count } = await tx.maintenanceHistory.updateMany({
            where: {
              id: wo.id,
              workOrderStatus: 'PENDING',
              assignedTechnicianId: null,
              ...notYet,
            },
            data: { escalatedAfterMinutes: minutes },
          });
          if (count === 0) return;
          const notice = {
            organizationId: wo.asset.organizationId,
            kind: 'escalation' as const,
            severity: 'critical' as const,
            title: `Nobody has taken this on for ${minutes} min: ${deviceLabel(wo.asset)}`,
            link: '/maintenance',
            assetId: wo.asset.id,
            workOrderId: wo.id,
            dedupeKey: `escalation:${minutes}:${wo.id}`,
          };
          const reached = await notify(tx, {
            ...notice,
            to: {
              roles: ['admin', 'engineer'],
              facilityId: wo.asset.currentFacilityId,
            },
            outbound: true,
          });
          // No engineer or admin for that facility: tell every administrator.
          if (reached === 0) {
            await notify(tx, { ...notice, to: { roles: ['admin'] } });
          }
          sent++;
        });
      }
    }
    if (sent) this.logger.warn(`Escalated ${sent} unclaimed urgent report(s)`);
    return sent;
  }

  /**
   * Sends due outbound messages, retrying failures with backoff. `now`
   * picks which messages are due; each one is then timed on its own, so a
   * slow gateway cannot make later messages' leases or signatures stale.
   */
  async deliver(now = new Date()): Promise<{ sent: number; failed: number }> {
    const config = notificationConfig();
    const clock = () => new Date(Math.max(Date.now(), now.getTime()));
    const due = await this.prisma.outboundMessage.findMany({
      where: { sentAt: null, failedAt: null, nextAttemptAt: { lte: now } },
      orderBy: { nextAttemptAt: 'asc' },
      take: 20,
      select: { id: true, nextAttemptAt: true, attempts: true, payload: true },
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

      const result: SendResult =
        config.webhookUrl && config.webhookSecret
          ? await this.post(
              config.webhookUrl,
              config.webhookSecret,
              message.id,
              message.payload,
              clock(),
            )
          : {
              ok: false,
              permanent: true,
              error:
                'No webhook is configured (NOTIFY_WEBHOOK_URL and NOTIFY_WEBHOOK_SECRET)',
            };

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

  private async post(
    url: string,
    secret: string,
    id: string,
    payload: Prisma.JsonValue,
    at: Date,
  ): Promise<SendResult> {
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(at.getTime() / 1000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'BioTrakr-Notifications',
          'X-BioTrakr-Delivery': id,
          'X-BioTrakr-Timestamp': String(timestamp),
          'X-BioTrakr-Signature': signWebhook(secret, timestamp, body),
        },
        body,
        // A redirect could carry the message elsewhere: not followed.
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      // Free the connection; the answer's content is not used.
      await res.body?.cancel().catch(() => undefined);
      return res.ok
        ? { ok: true }
        : {
            ok: false,
            error: `HTTP ${res.status}`,
            permanent: permanent(res.status),
          };
    } catch (e) {
      return {
        ok: false,
        permanent: false,
        error:
          (e as Error).name === 'TimeoutError'
            ? `No answer within ${TIMEOUT_MS / 1000} s`
            : (e as Error).message,
      };
    }
  }
}
