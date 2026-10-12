import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import type { SystemAlert } from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { channelProblems, channelStatus } from '../notifications/channels';
import { notify, type Severity } from '../notifications/notify';
import {
  backupProblems,
  backupStatusFile,
  diskOf,
  diskProblem,
  readBackupStatus,
  type Problem,
} from './backup-status';
import { isLate, jobHealth } from './job-health';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** While a problem lasts, administrators are reminded this often. */
const REMIND_MS: Record<Problem['severity'], number> = {
  critical: DAY,
  warning: 7 * DAY,
};
const HEARTBEAT_TIMEOUT_MS = 10_000;
const LINK = '/settings?tab=system';

/**
 * Watches the installation itself, which nobody looks at day to day:
 * backups and their copy off the server, disk space, the background jobs,
 * and whether urgent messages are getting out. Every five minutes it finds
 * the problems, tells administrators (in the app and outside it) when one
 * starts, reminds them while it lasts and tells them when it is fixed, and
 * calls HEARTBEAT_URL so a monitor elsewhere notices if this server stops.
 *
 * Job health is per process: run one API instance per server (as the
 * install guide does), or alerts about jobs may come and go.
 */
@Injectable()
export class SystemChecksService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger('SystemChecks');
  private readonly startedAt = Date.now();
  private timer: NodeJS.Timeout | null = null;
  private startup: NodeJS.Timeout | null = null;
  private running = false;
  private heartbeat: { at: Date; ok: boolean; error: string | null } | null =
    null;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap(): void {
    if (
      process.env.SYSTEM_CHECKS === 'off' ||
      process.env.NODE_ENV === 'test'
    ) {
      return;
    }
    const every = Number(process.env.SYSTEM_CHECK_INTERVAL_MS) || 5 * MINUTE;
    this.timer = setInterval(() => void this.tick(), every);
    this.timer.unref();
    this.startup = setTimeout(() => void this.tick(), MINUTE);
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
      await this.run();
    } catch (error) {
      this.logger.error(`System checks failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** One pass: find problems, tell administrators, then the heartbeat. */
  async run(now = new Date()): Promise<Problem[]> {
    const problems = await this.findProblems(now);
    await this.reconcile(problems, now);
    // Reaching here means the API and the database answer.
    await this.beat(now);
    return problems;
  }

  async findProblems(now = new Date()): Promise<Problem[]> {
    const problems: Problem[] = [];

    const file = backupStatusFile();
    if (file) {
      problems.push(
        ...backupProblems(
          await readBackupStatus(file),
          now,
          now.getTime() - this.startedAt,
        ),
      );
      // The status volume sits with Docker's volumes, as the database does.
      const server = diskProblem(
        'disk.server',
        'The server disk (database)',
        await diskOf(file),
      );
      if (server) problems.push(server);
    }

    for (const job of jobHealth()) {
      if (!isLate(job, now)) continue;
      problems.push({
        key: `job.${job.name}`.slice(0, 100),
        severity: 'critical',
        title: `Background job not working: ${job.name}`,
        detail: job.lastError
          ? `Failing since ${(job.lastOkAt ?? job.startedAt).toISOString()}: ${job.lastError}`
          : `Has not finished since ${(job.lastOkAt ?? job.startedAt).toISOString()}.`,
      });
    }

    for (const p of channelProblems()) {
      problems.push({
        key: `config.${p.channel}`,
        severity: 'critical',
        title: p.message,
        detail: 'Fix the setting in deploy/.env, then: docker compose up -d',
      });
    }
    const channels = channelStatus();
    if (!channels.email && !channels.sms && !channels.webhook) {
      problems.push({
        key: 'channels.none',
        severity: 'warning',
        title: 'Urgent reports reach only people who have BioTrakr open',
        detail:
          'Set up email (SMTP_HOST, NOTIFY_EMAIL_FROM) or SMS (NOTIFY_SMS_URL) so a failed life-saving device reaches biomed at night. See the install guide.',
      });
    }

    problems.push(...(await this.deliveryProblems(now)));
    return problems;
  }

  /** A channel whose messages gave up, or keep failing, in the last day. */
  private async deliveryProblems(now: Date): Promise<Problem[]> {
    const since = new Date(now.getTime() - DAY);
    const failing = await this.prisma.outboundMessage.findMany({
      where: {
        sentAt: null,
        createdAt: { gte: since },
        OR: [{ failedAt: { not: null } }, { attempts: { gte: 3 } }],
      },
      select: { channel: true, lastError: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const byChannel = new Map<string, typeof failing>();
    for (const m of failing) {
      byChannel.set(m.channel, [...(byChannel.get(m.channel) ?? []), m]);
    }
    const names: Record<string, string> = {
      email: 'Emails',
      sms: 'Text messages',
      webhook: 'Webhook messages',
    };
    return [...byChannel].map(([channel, list]) => ({
      key: `delivery.${channel}`,
      severity: 'critical' as const,
      title: `${names[channel] ?? channel} are not getting through`,
      detail: `${list.length} message(s) not delivered in the last 24 hours. Latest error: ${list[0].lastError ?? 'unknown'}`,
    }));
  }

  /**
   * Compares with what administrators were already told. Each change is
   * claimed on its row, so several API instances send it once.
   */
  async reconcile(problems: Problem[], now = new Date()): Promise<void> {
    const open = await this.prisma.systemAlert.findMany({
      where: { resolvedAt: null },
    });
    const seen = new Set<string>();

    for (const p of problems) {
      seen.add(p.key);
      const fields = {
        severity: p.severity,
        title: p.title.slice(0, 200),
        detail: p.detail?.slice(0, 1000) ?? null,
        lastSeenAt: now,
      };
      const row = open.find((a) => a.key === p.key);
      if (!row) {
        // New, or back again after it was fixed.
        const claimed = await this.claimNew(p.key, fields, now);
        if (claimed) await this.tell(p, 'started', now);
        continue;
      }
      const worse = row.severity === 'warning' && p.severity === 'critical';
      const due =
        !row.lastNotifiedAt ||
        now.getTime() - row.lastNotifiedAt.getTime() >= REMIND_MS[p.severity];
      const { count } = await this.prisma.systemAlert.updateMany({
        where: {
          key: p.key,
          resolvedAt: null,
          lastNotifiedAt: row.lastNotifiedAt,
        },
        data: worse || due ? { ...fields, lastNotifiedAt: now } : fields,
      });
      if (count && (worse || due)) await this.tell(p, 'reminder', now);
    }

    for (const row of open) {
      if (seen.has(row.key)) continue;
      const { count } = await this.prisma.systemAlert.updateMany({
        where: { key: row.key, resolvedAt: null },
        data: { resolvedAt: now },
      });
      if (count) {
        await this.tell(
          { ...row, severity: row.severity as Problem['severity'] },
          'fixed',
          now,
        );
      }
    }
  }

  private async claimNew(
    key: string,
    fields: Pick<SystemAlert, 'severity' | 'title' | 'detail' | 'lastSeenAt'>,
    now: Date,
  ): Promise<boolean> {
    const reopened = await this.prisma.systemAlert.updateMany({
      where: { key, resolvedAt: { not: null } },
      data: {
        ...fields,
        firstSeenAt: now,
        lastNotifiedAt: now,
        resolvedAt: null,
      },
    });
    if (reopened.count) return true;
    try {
      await this.prisma.systemAlert.create({
        data: { key, ...fields, firstSeenAt: now, lastNotifiedAt: now },
      });
      return true;
    } catch {
      // Another instance recorded it first (or it is already open).
      return false;
    }
  }

  /** To every administrator; a critical problem also outside the app. */
  private async tell(
    p: Pick<Problem, 'key' | 'title' | 'severity'> & {
      detail?: string | null;
    },
    phase: 'started' | 'reminder' | 'fixed',
    now: Date,
  ): Promise<void> {
    const severity: Severity = phase === 'fixed' ? 'info' : p.severity;
    const title =
      phase === 'fixed'
        ? `Fixed: ${p.title}`
        : phase === 'reminder'
          ? `Still a problem: ${p.title}`
          : p.title;
    const organizations = await this.prisma.organization.findMany({
      select: { id: true },
    });
    for (const org of organizations) {
      await this.prisma.$transaction((tx) =>
        notify(tx, {
          organizationId: org.id,
          kind: phase === 'fixed' ? 'system_resolved' : 'system_alert',
          severity,
          title,
          body: phase === 'fixed' ? undefined : (p.detail ?? undefined),
          link: LINK,
          to: { roles: ['admin'] },
          dedupeKey: `system:${p.key}:${phase}:${now.getTime()}`.slice(0, 200),
          // Whoever was paged about a critical problem hears it is fixed.
          outbound: p.severity === 'critical',
          outboundBody: phase === 'fixed' ? undefined : (p.detail ?? undefined),
        }),
      );
    }
    this.logger.warn(
      `${title}${p.detail && phase !== 'fixed' ? ` (${p.detail})` : ''}`,
    );
  }

  /** Tells an outside monitor this server is alive (see HEARTBEAT_URL). */
  private async beat(now: Date): Promise<void> {
    const url = process.env.HEARTBEAT_URL?.trim();
    if (!url) return;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(HEARTBEAT_TIMEOUT_MS),
        redirect: 'follow',
      });
      await res.body?.cancel().catch(() => undefined);
      this.heartbeat = {
        at: now,
        ok: res.ok,
        error: res.ok ? null : `HTTP ${res.status}`,
      };
    } catch (e) {
      this.heartbeat = { at: now, ok: false, error: (e as Error).message };
    }
  }

  lastHeartbeat() {
    return this.heartbeat;
  }
}
