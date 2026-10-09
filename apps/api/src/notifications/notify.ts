import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { CriticalityLevel, Prisma } from '@prisma/client';

import type { Role } from '../auth/roles';

type Tx = Prisma.TransactionClient;

export type Severity = 'critical' | 'warning' | 'info';
export type NotificationKind =
  | 'problem_reported'
  | 'device_alert'
  | 'escalation'
  | 'assigned'
  | 'resolved'
  | 'cancelled'
  | 'pm_due';

/** Settings, read when used so tests and restarts pick up changes. */
export function notificationConfig() {
  const url = process.env.NOTIFY_WEBHOOK_URL?.trim() || null;
  const secret = process.env.NOTIFY_WEBHOOK_SECRET?.trim() || null;
  const minutes = (process.env.NOTIFY_ESCALATE_MINUTES ?? '15,60')
    .split(',')
    .map((m) => Number(m.trim()))
    .filter((m) => Number.isFinite(m) && m > 0)
    .sort((a, b) => a - b);
  return {
    /** Outbound delivery needs both: messages are signed so a gateway can trust them. */
    webhookUrl: url && secret && secret.length >= 16 ? url : null,
    webhookSecret: secret,
    /** Public address of the web app, for links in outbound messages. */
    appUrl: (process.env.APP_URL ?? '').replace(/\/+$/, ''),
    escalateAfterMinutes: minutes.length ? minutes : [15, 60],
  };
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
  /** Also send outside the app, when a webhook is configured. */
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
  const config = notificationConfig();
  if (input.outbound && config.webhookUrl) {
    await tx.outboundMessage.createMany({
      data: [
        {
          organizationId: input.organizationId,
          channel: 'webhook',
          dedupeKey: input.dedupeKey
            ? `webhook:${input.dedupeKey}`
            : `webhook:${randomUUID()}`,
          payload: {
            id: randomUUID(),
            event: input.kind,
            severity: input.severity,
            title,
            body: clip(input.outboundBody, 1000) ?? null,
            url:
              config.appUrl && input.link
                ? `${config.appUrl}${input.link}`
                : null,
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
        },
      ],
      skipDuplicates: true,
    });
  }
  return recipients.length;
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
