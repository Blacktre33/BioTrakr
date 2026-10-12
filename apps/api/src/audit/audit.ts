import type { Prisma, PrismaClient } from '@prisma/client';

import type { AuthUser } from '../auth/auth-user';

type Tx = Prisma.TransactionClient;

/** Who made a change: a person, or the system (the schedule, a device alert). */
export interface Actor {
  organizationId: string;
  userId: string | null;
  role: string;
}

export const actorOf = (user: AuthUser): Actor => ({
  organizationId: user.organizationId,
  userId: user.userId,
  role: user.role,
});

export const systemActor = (organizationId: string): Actor => ({
  organizationId,
  userId: null,
  role: 'system',
});

export type AuditEntity =
  | 'asset'
  | 'work_order'
  | 'calibration'
  | 'safety_test'
  | 'contract'
  | 'vendor'
  | 'document'
  | 'facility'
  | 'department'
  | 'building'
  | 'floor'
  | 'room'
  | 'user';

/** One field, as it reads on screen before and after. */
export interface Change {
  field: string;
  label: string;
  from: string | null;
  to: string | null;
  /** Personal details: the history says they changed, not to what. */
  hidden?: true;
}

export interface AuditEntry {
  /** e.g. asset.updated, work_order.completed */
  action: string;
  entityType: AuditEntity;
  entityId: string;
  /** The device it concerns, so it shows in the device's history. */
  assetId?: string | null;
  /** A sentence for people: "Edited VENT-7: Room, Department". */
  summary: string;
  changes?: Change[];
  reason?: string | null;
}

const clip = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;

/** Entries waiting for their transaction to finish, by transaction. */
const pending = new WeakMap<object, Prisma.AuditEventCreateManyInput[]>();

/**
 * Runs `work` in a transaction and writes the audit entries it noted at
 * the end, in one statement: the change and its history commit together
 * or not at all. Written last because the database makes each hospital's
 * writers take turns on the chain; holding that turn only while
 * committing means it never waits on another lock.
 */
export function auditedTransaction<T>(
  prisma: Pick<PrismaClient, '$transaction'>,
  work: (tx: Tx) => Promise<T>,
  options?: { timeout?: number; maxWait?: number },
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const outer = pending.get(tx);
    const entries: Prisma.AuditEventCreateManyInput[] = [];
    pending.set(tx, entries);
    try {
      const result = await work(tx);
      if (entries.length) await tx.auditEvent.createMany({ data: entries });
      return result;
    } finally {
      if (outer) pending.set(tx, outer);
      else pending.delete(tx);
    }
  }, options);
}

/**
 * Notes a change for the edit history; it is written when the transaction
 * ends. Only inside auditedTransaction, so no change goes unrecorded.
 */
export function audit(tx: Tx, actor: Actor, entry: AuditEntry): void {
  const entries = pending.get(tx);
  if (!entries) {
    throw new Error(
      `Audit entry ${entry.action} outside an audited transaction`,
    );
  }
  entries.push({
    organizationId: actor.organizationId,
    actorId: actor.userId,
    actorRole: actor.role,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    assetId: entry.assetId ?? null,
    summary: clip(entry.summary, 1000),
    ...(entry.changes?.length
      ? { changes: entry.changes as unknown as Prisma.InputJsonValue }
      : {}),
    reason: entry.reason?.trim() ? clip(entry.reason.trim(), 4000) : null,
  });
}
