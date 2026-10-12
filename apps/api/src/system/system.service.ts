import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import type { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import {
  channelStatus,
  emailConfig,
  sendEmail,
  sendSms,
  sendWebhook,
  smsConfig,
  smsText,
  type SendResult,
} from '../notifications/channels';
import { notificationConfig } from '../notifications/notify';
import { backupStatusFile, diskOf, readBackupStatus } from './backup-status';
import { isLate, jobHealth } from './job-health';
import { SystemChecksService } from './system-checks.service';

const WEEK = 7 * 24 * 60 * 60 * 1000;
const TEST_TITLE = 'Test alert from BioTrakr';

/** What Settings → System shows administrators, and its test button. */
@Injectable()
export class SystemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checks: SystemChecksService,
  ) {}

  async overview(user: AuthUser) {
    const now = new Date();
    const file = backupStatusFile();
    const [problems, alerts, failures] = await Promise.all([
      this.checks.findProblems(now),
      this.prisma.systemAlert.findMany({ where: { resolvedAt: null } }),
      // This organization's only: they name its staff.
      this.prisma.outboundMessage.findMany({
        where: {
          organizationId: user.organizationId,
          sentAt: null,
          attempts: { gte: 1 },
          createdAt: { gte: new Date(now.getTime() - WEEK) },
        },
        select: {
          id: true,
          channel: true,
          payload: true,
          attempts: true,
          lastError: true,
          createdAt: true,
          failedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    const { escalateAfterMinutes, escalateRepeatMinutes } =
      notificationConfig();
    return {
      checkedAt: now,
      problems: problems.map((p) => ({
        ...p,
        since: alerts.find((a) => a.key === p.key)?.firstSeenAt ?? null,
      })),
      backup: file
        ? { monitored: true, ...(await readBackupStatus(file)) }
        : { monitored: false, status: null, error: null },
      serverDisk: file ? await diskOf(file) : null,
      jobs: jobHealth().map((j) => ({
        name: j.name,
        everyMs: j.everyMs,
        lastOkAt: j.lastOkAt,
        lastErrorAt: j.lastErrorAt,
        lastError: j.lastError,
        late: isLate(j, now),
      })),
      channels: channelStatus(),
      escalation: {
        afterMinutes: escalateAfterMinutes,
        repeatMinutes: escalateRepeatMinutes,
      },
      heartbeat: {
        configured: Boolean(process.env.HEARTBEAT_URL?.trim()),
        last: this.checks.lastHeartbeat(),
      },
      undelivered: failures.map((m) => {
        const payload = (m.payload ?? {}) as Record<string, unknown>;
        return {
          id: m.id,
          channel: m.channel,
          to: m.channel === 'webhook' ? null : String(payload.to ?? ''),
          title:
            m.channel === 'email'
              ? String(payload.subject ?? '')
              : m.channel === 'sms'
                ? String(payload.text ?? '')
                : String(payload.title ?? ''),
          attempts: m.attempts,
          lastError: m.lastError,
          createdAt: m.createdAt,
          gaveUpAt: m.failedAt,
        };
      }),
    };
  }

  /**
   * Sends a test through each channel that is set up, to the administrator
   * who asked, straight away (not queued), and says what happened.
   */
  async testAlert(user: AuthUser) {
    const me = await this.prisma.user.findFirst({
      where: { id: user.userId, organizationId: user.organizationId },
      select: {
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
      },
    });
    const { appUrl, webhookUrl, webhookSecret } = notificationConfig();
    const link = appUrl ? `${appUrl}/settings?tab=system` : null;
    type Outcome = (SendResult & { to: string | null }) | null;

    const email = emailConfig();
    const emailResult: Outcome = !email
      ? null
      : me?.email
        ? {
            to: me.email,
            ...(await sendEmail(email, {
              to: me.email,
              subject: `[BioTrakr] ${TEST_TITLE}`,
              text: [
                `${TEST_TITLE}. Urgent reports and system alerts will reach you by email like this.`,
                link ? `\nOpen in BioTrakr: ${link}` : null,
              ]
                .filter(Boolean)
                .join('\n'),
            })),
          }
        : { to: null, ok: false, error: 'Your account has no email address' };

    const sms = smsConfig();
    const smsResult: Outcome = !sms
      ? null
      : me?.phone
        ? {
            to: me.phone,
            ...(await sendSms(
              sms,
              me.phone,
              smsText(sms.text, { title: TEST_TITLE, link }),
            )),
          }
        : {
            to: null,
            ok: false,
            error:
              'Your account has no mobile number (Settings → People → your name)',
          };

    const webhookResult: Outcome =
      webhookUrl && webhookSecret
        ? {
            to: null,
            ...(await sendWebhook(
              webhookUrl,
              webhookSecret,
              randomUUID(),
              {
                id: randomUUID(),
                event: 'test',
                severity: 'info',
                title: TEST_TITLE,
                body: null,
                url: link,
                assetId: null,
                workOrderId: null,
                recipients: me
                  ? [
                      {
                        name: `${me.firstName} ${me.lastName}`.trim(),
                        role: me.role,
                        email: me.email,
                        phone: me.phone,
                      },
                    ]
                  : [],
                createdAt: new Date().toISOString(),
              },
              new Date(),
            )),
          }
        : null;

    return { email: emailResult, sms: smsResult, webhook: webhookResult };
  }
}
