import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createHmac } from 'crypto';

import { STOP_STATUSES } from '../assets/asset-status.service';
import { PrismaService } from '../database/prisma.service';
import { deviceLabel, HIGH_RISK, notificationConfig, notify } from './notify';

/** Only fairly recent reports are escalated (not a backlog found on first start). */
const ESCALATION_WINDOW_MS = 24 * 60 * 60 * 1000;
/** A claimed message is someone else's for this long, then retried. */
const LEASE_MS = 2 * 60 * 1000;
export const MAX_ATTEMPTS = 8;
const TIMEOUT_MS = 10_000;

/** 30 s, 1, 2, 4… minutes, capped at an hour. */
export function retryDelayMs(attempts: number): number {
  return Math.min(60 * 60 * 1000, 30_000 * 2 ** Math.max(0, attempts - 1));
}

/** Header value a receiver recomputes to check a message really came from BioTrakr. */
export function signWebhook(secret: string, timestamp: number, body: string) {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

/**
 * Work that happens without anyone clicking: escalating urgent problem
 * reports nobody has taken on, and delivering outbound messages. Runs every
 * 30 s in each API instance; claims and dedupe keys keep instances from
 * doing the same work twice.
 */
@Injectable()
export class NotificationJobsService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger('Notifications');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

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

  /** One pass of both jobs. Overlapping passes are skipped. */
  async tick(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.escalate(now);
      await this.deliver(now);
    } catch (error) {
      this.logger.error(`Notification job failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * An urgent report (critical device, or a high-risk device out of use)
   * still unassigned after 15 and again after 60 minutes goes to the
   * engineers and administrators, and outside the app.
   */
  async escalate(now = new Date()): Promise<number> {
    const { escalateAfterMinutes } = notificationConfig();
    let sent = 0;
    const key = (minutes: number, id: string) => `escalation:${minutes}:${id}`;
    // Latest level first: after downtime, a report due for both 15 and 60
    // minutes gets one message, not two.
    for (const minutes of [...escalateAfterMinutes].reverse()) {
      const stuck = await this.prisma.maintenanceHistory.findMany({
        where: {
          workOrderType: 'CORRECTIVE_MAINTENANCE',
          workOrderStatus: 'PENDING',
          assignedTechnicianId: null,
          createdAt: {
            lte: new Date(now.getTime() - minutes * 60_000),
            gte: new Date(now.getTime() - ESCALATION_WINDOW_MS),
          },
          asset: { deletedAt: null },
          OR: [
            { isEmergency: true },
            {
              asset: {
                criticalityLevel: { in: HIGH_RISK },
                assetStatus: { in: [...STOP_STATUSES] },
              },
            },
          ],
        },
        select: {
          id: true,
          description: true,
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
        const dedupeKey = key(minutes, wo.id);
        const done = await this.prisma.notification.count({
          where: {
            dedupeKey: {
              in: escalateAfterMinutes
                .filter((m) => m >= minutes)
                .map((m) => key(m, wo.id)),
            },
          },
        });
        if (done) continue;
        await this.prisma.$transaction(async (tx) => {
          // Taken on in the meantime? Then there is nothing to escalate.
          const still = await tx.maintenanceHistory.count({
            where: {
              id: wo.id,
              workOrderStatus: 'PENDING',
              assignedTechnicianId: null,
            },
          });
          if (!still) return;
          const reached = await notify(tx, {
            organizationId: wo.asset.organizationId,
            kind: 'escalation',
            severity: 'critical',
            title: `Nobody has taken this on for ${minutes} min: ${deviceLabel(wo.asset)}`,
            body: wo.description?.split('\n')[0],
            link: '/maintenance',
            assetId: wo.asset.id,
            workOrderId: wo.id,
            to: {
              roles: ['admin', 'engineer'],
              facilityId: wo.asset.currentFacilityId,
            },
            dedupeKey,
            outbound: true,
          });
          sent += reached > 0 ? 1 : 0;
        });
      }
    }
    if (sent) this.logger.warn(`Escalated ${sent} unclaimed urgent report(s)`);
    return sent;
  }

  /** Sends due outbound messages, retrying failures with backoff. */
  async deliver(now = new Date()): Promise<{ sent: number; failed: number }> {
    const config = notificationConfig();
    const due = await this.prisma.outboundMessage.findMany({
      where: { sentAt: null, failedAt: null, nextAttemptAt: { lte: now } },
      orderBy: { nextAttemptAt: 'asc' },
      take: 20,
      select: { id: true, nextAttemptAt: true, payload: true },
    });
    let sent = 0;
    let failed = 0;
    for (const message of due) {
      // Claim it: of several API instances, only one sends each message.
      const { count } = await this.prisma.outboundMessage.updateMany({
        where: {
          id: message.id,
          sentAt: null,
          failedAt: null,
          nextAttemptAt: message.nextAttemptAt,
        },
        data: {
          nextAttemptAt: new Date(now.getTime() + LEASE_MS),
          attempts: { increment: 1 },
        },
      });
      if (count === 0) continue;
      const claimed = await this.prisma.outboundMessage.findUnique({
        where: { id: message.id },
        select: { attempts: true },
      });
      const attempts = claimed?.attempts ?? 1;

      let error: string | null = null;
      if (!config.webhookUrl || !config.webhookSecret) {
        error =
          'No webhook is configured (NOTIFY_WEBHOOK_URL and NOTIFY_WEBHOOK_SECRET)';
      } else {
        error = await this.post(
          config.webhookUrl,
          config.webhookSecret,
          message.id,
          message.payload,
          now,
        );
      }

      const data: Prisma.OutboundMessageUpdateInput = error
        ? attempts >= MAX_ATTEMPTS || !config.webhookUrl
          ? { failedAt: now, lastError: error.slice(0, 500) }
          : {
              nextAttemptAt: new Date(now.getTime() + retryDelayMs(attempts)),
              lastError: error.slice(0, 500),
            }
        : { sentAt: now, lastError: null };
      await this.prisma.outboundMessage.update({
        where: { id: message.id },
        data,
      });
      if (!error) sent++;
      else if (data.failedAt) {
        failed++;
        this.logger.error(
          `Gave up on outbound message ${message.id} after ${attempts} attempt(s): ${error}`,
        );
      }
    }
    return { sent, failed };
  }

  /** Returns null when delivered, otherwise why not. */
  private async post(
    url: string,
    secret: string,
    id: string,
    payload: Prisma.JsonValue,
    now: Date,
  ): Promise<string | null> {
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(now.getTime() / 1000);
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
        // A redirect could carry the patient-adjacent payload elsewhere.
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return res.ok ? null : `HTTP ${res.status}`;
    } catch (e) {
      return (e as Error).name === 'TimeoutError'
        ? `No answer within ${TIMEOUT_MS / 1000} s`
        : (e as Error).message;
    }
  }
}
