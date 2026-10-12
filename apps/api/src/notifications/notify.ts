import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { CriticalityLevel, Prisma } from '@prisma/client';

import type { Role } from '../auth/roles';
import { emailConfig, smsConfig, smsText } from './channels';

type Tx = Prisma.TransactionClient;

export type Severity = 'critical' | 'warning' | 'info';
export type NotificationKind =
  | 'problem_reported'
  | 'device_alert'
  | 'escalation'
  | 'assigned'
  | 'resolved'
  | 'cancelled'
  | 'pm_due'
  | 'calibration_due'
  | 'calibration_failed'
  | 'safety_test_due'
  | 'safety_test_failed'
  | 'contract_expiring'
  | 'warranty_expiring'
  | 'audit_chain_broken'
  | 'downtime_limit'
  | 'pm_failed'
  | 'condemnation'
  | 'system_alert'
  | 'system_resolved';

/** Settings, read when used so tests and restarts pick up changes. */
export function notificationConfig() {
  const url = process.env.NOTIFY_WEBHOOK_URL?.trim() || null;
  const secret = process.env.NOTIFY_WEBHOOK_SECRET?.trim() || null;
  const minutes = (process.env.NOTIFY_ESCALATE_MINUTES ?? '15,60')
    .split(',')
    .map((m) => Number(m.trim()))
    .filter((m) => Number.isFinite(m) && m > 0)
    .sort((a, b) => a - b);
  const repeat = Number(process.env.NOTIFY_ESCALATE_REPEAT_MINUTES ?? 60);
  return {
    /** Outbound delivery needs both: messages are signed so a gateway can trust them. */
    webhookUrl: url && secret && secret.length >= 16 ? url : null,
    webhookSecret: secret,
    /** Public address of the web app, for links in outbound messages. */
    appUrl: (process.env.APP_URL ?? '').replace(/\/+$/, ''),
    escalateAfterMinutes: minutes.length ? minutes : [15, 60],
    /** After the last step, again every this many minutes until work starts (0: never). */
    escalateRepeatMinutes:
      Number.isFinite(repeat) && repeat >= 5 ? Math.round(repeat) : 0,
  };
}

/**
 * The escalation step a report this many minutes old has reached: the
 * latest configured step, then every `repeat` minutes after the last one.
 * Null before the first step.
 */
export function escalationLevel(
  ageMinutes: number,
  steps: number[],
  repeat: number,
): number | null {
  const reached = steps.filter((m) => m <= ageMinutes);
  if (reached.length === 0) return null;
  const last = steps[steps.length - 1];
  if (repeat > 0 && ageMinutes >= last + repeat) {
    return last + Math.floor((ageMinutes - last) / repeat) * repeat;
  }
  return reached[reached.length - 1];
}

/** "15 min", "60 min", "2 h", "2 h 30 min". */
export function formatMinutes(minutes: number): string {
  if (minutes < 120) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Devices whose failure endangers patients get the loudest notices. */
export const HIGH_RISK: CriticalityLevel[] = ['CRITICAL', 'HIGH'];

export interface NotifyInput {
  organizationId: string;
  kind: NotificationKind;
  severity: Severity;
  title: string;
  body?: string;
  link?: string;
  assetId?: string;
  workOrderId?: string;
  /** Particular people, or everyone with these roles at the facility (plus organization-wide staff). */
  to: { userIds: string[] } | { roles: Role[]; facilityId?: string | null };
  /** Usually whoever caused the event: they already know. */
  excludeUserId?: string | null;
  /** The same key never reaches the same person (or the webhook) twice. */
  dedupeKey?: string;
  /** Also send outside the app: email, SMS and the webhook, whichever are set up. */
  outbound?: boolean;
  /**
   * Text for the outside message. Free text typed by ward staff (which may
   * name a patient) is not sent off-site: by default the message carries
   * only the title, device and link.
   */
  outboundBody?: string;
}

const clip = (text: string | undefined, max: number) =>
  text && text.length > max ? `${text.slice(0, max - 1)}…` : text;

/**
 * Records a notice for each recipient in the caller's transaction, so it is
 * saved exactly when the event is. Returns how many people it reached.
 */
export async function notify(tx: Tx, input: NotifyInput): Promise<number> {
  const where: Prisma.UserWhereInput = {
    organizationId: input.organizationId,
    isActive: true,
    ...(input.excludeUserId ? { id: { not: input.excludeUserId } } : {}),
  };
  if ('userIds' in input.to) {
    const ids = input.to.userIds.filter((id) => id !== input.excludeUserId);
    if (ids.length === 0) return 0;
    where.AND = [{ id: { in: ids } }];
  } else {
    where.AND = [
      {
        OR: input.to.roles.map((role) => ({
          role: { equals: role, mode: 'insensitive' as const },
        })),
      },
      // Staff tied to a facility hear about that facility; staff without
      // one cover the whole organization.
      input.to.facilityId
        ? { OR: [{ facilityId: null }, { facilityId: input.to.facilityId }] }
        : {},
    ];
  }
  const recipients = await tx.user.findMany({
    where,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      role: true,
    },
    take: 500,
  });
  const title = clip(input.title, 200)!;
  const body = clip(input.body, 1000);
  if (recipients.length > 0) {
    await tx.notification.createMany({
      data: recipients.map((r) => ({
        organizationId: input.organizationId,
        userId: r.id,
        kind: input.kind,
        severity: input.severity,
        title,
        body: body ?? null,
        link: input.link ?? null,
        assetId: input.assetId ?? null,
        workOrderId: input.workOrderId ?? null,
        dedupeKey: input.dedupeKey ?? null,
      })),
      skipDuplicates: true,
    });
  }

  // Outside messages go out even when nobody in the app matched: the
  // gateway may page an on-call phone that has no BioTrakr account.
  if (input.outbound) {
    await queueOutside(tx, input, title, recipients);
  }
  return recipients.length;
}

type Recipient = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  role: string;
};

/**
 * Queues the outside messages for a notice: one to the webhook, and an
 * email and an SMS to each person, for whichever are set up. They are sent
 * (and retried) by NotificationJobsService.deliver.
 */
async function queueOutside(
  tx: Tx,
  input: NotifyInput,
  title: string,
  recipients: Recipient[],
) {
  const config = notificationConfig();
  const url =
    config.appUrl && input.link ? `${config.appUrl}${input.link}` : null;
  const body = clip(input.outboundBody, 1000) ?? null;
  const key = input.dedupeKey ?? randomUUID();
  const messages: Prisma.OutboundMessageCreateManyInput[] = [];

  if (config.webhookUrl) {
    messages.push({
      organizationId: input.organizationId,
      channel: 'webhook',
      dedupeKey: `webhook:${key}`,
      payload: {
        id: randomUUID(),
        event: input.kind,
        severity: input.severity,
        title,
        body,
        url,
        assetId: input.assetId ?? null,
        workOrderId: input.workOrderId ?? null,
        // So a gateway can text or call them.
        recipients: recipients.map((r) => ({
          name: `${r.firstName} ${r.lastName}`.trim(),
          role: r.role,
          email: r.email,
          phone: r.phone,
        })),
        createdAt: new Date().toISOString(),
      },
    });
  }
  if (emailConfig()) {
    const text = [
      title,
      body,
      url ? `\nOpen in BioTrakr: ${url}` : null,
      '\nSent by BioTrakr to the staff who look after this equipment. Replies are not read.',
    ]
      .filter(Boolean)
      .join('\n');
    for (const r of recipients) {
      if (!r.email) continue;
      messages.push({
        organizationId: input.organizationId,
        channel: 'email',
        dedupeKey: `email:${key}:${r.id}`,
        payload: { to: r.email, subject: `[BioTrakr] ${title}`, text },
      });
    }
  }
  const sms = smsConfig();
  if (sms) {
    const text = smsText(sms.text, { title: clip(title, 120)!, link: url });
    for (const r of recipients) {
      if (!r.phone) continue;
      messages.push({
        organizationId: input.organizationId,
        channel: 'sms',
        dedupeKey: `sms:${key}:${r.id}`,
        payload: { to: r.phone, text },
      });
    }
  }
  if (messages.length > 0) {
    await tx.outboundMessage.createMany({
      data: messages,
      skipDuplicates: true,
    });
  }
}

/** What a notice needs to name a device. */
export async function deviceForNotice(
  tx: Tx,
  assetId: string,
  organizationId: string,
) {
  return tx.asset.findFirst({
    where: { id: assetId, organizationId },
    select: {
      id: true,
      assetTagNumber: true,
      equipmentName: true,
      criticalityLevel: true,
      currentFacilityId: true,
      currentRoom: { select: { roomName: true } },
      custodianDepartment: { select: { departmentName: true } },
    },
  });
}

export function deviceLabel(device: {
  equipmentName: string;
  assetTagNumber: string;
}): string {
  return `${device.equipmentName} (${device.assetTagNumber})`;
}

const logger = new Logger('Notifications');

/**
 * Runs `work` (recording notices) so that its failure never undoes the
 * event itself (a quarantine, a problem report): it runs inside a savepoint
 * that is rolled back alone if anything in it fails.
 */
export async function bestEffort<T>(
  tx: Tx,
  what: string,
  work: () => Promise<T>,
): Promise<T | undefined> {
  await tx.$executeRawUnsafe('SAVEPOINT notices');
  try {
    const result = await work();
    await tx.$executeRawUnsafe('RELEASE SAVEPOINT notices');
    return result;
  } catch (error) {
    await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT notices');
    logger.error(`Could not record ${what}: ${(error as Error).message}`);
    return undefined;
  }
}
