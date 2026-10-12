import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import { bestEffort, notify } from '../notifications/notify';
import type { Change } from './audit';
import type { ListAuditQuery } from './audit.dto';

/** "2026-04-01" is that day here, not midnight UTC. */
function localDay(value: string, end = false): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(value);
  if (end) d.setHours(23, 59, 59, 999);
  return d;
}

const EVENT_SELECT = {
  id: true,
  seq: true,
  occurredAt: true,
  actorRole: true,
  action: true,
  entityType: true,
  entityId: true,
  assetId: true,
  summary: true,
  changes: true,
  reason: true,
  actor: { select: { id: true, firstName: true, lastName: true } },
  asset: { select: { assetTagNumber: true, equipmentName: true } },
} satisfies Prisma.AuditEventSelect;

type Row = Prisma.AuditEventGetPayload<{ select: typeof EVENT_SELECT }>;

/** How a hospital's chain stands when recomputed. */
export interface ChainCheck {
  entries: number;
  /** The head: write it down to show later that nothing was removed from the end. */
  lastSeq: number | null;
  lastHash: string | null;
  /** The first entry that does not match; null when intact. */
  brokenAt: number | null;
  checkedAt: Date;
}

const fullName = (u: { firstName: string; lastName: string }) =>
  `${u.firstName} ${u.lastName}`.trim();

export const present = (
  { actor, asset, seq, changes, ...e }: Row,
  subject: string | null = null,
) => ({
  ...e,
  seq: Number(seq),
  actor: actor ? { id: actor.id, name: fullName(actor) } : null,
  device: asset ? `${asset.assetTagNumber} · ${asset.equipmentName}` : null,
  /** For an account: the person's name now (kept out of the hashed entry). */
  subject,
  changes: (changes as unknown as Change[] | null) ?? [],
});

/**
 * The edit history: who changed what, when and why, newest first, and a
 * check that nobody has altered it since.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('AuditTrail');

  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListAuditQuery, user: AuthUser) {
    const where: Prisma.AuditEventWhereInput = {
      organizationId: user.organizationId,
      ...(query.assetId ? { assetId: query.assetId } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: localDay(query.from) } : {}),
              ...(query.to ? { lte: localDay(query.to, true) } : {}),
            },
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditEvent.count({ where }),
      this.prisma.auditEvent.findMany({
        where,
        orderBy: { seq: 'desc' },
        skip: query.skip ?? 0,
        take: query.take ?? 25,
        select: EVENT_SELECT,
      }),
    ]);
    const accounts = rows
      .filter((r) => r.entityType === 'user')
      .map((r) => r.entityId);
    const people = accounts.length
      ? await this.prisma.user.findMany({
          where: { id: { in: accounts }, organizationId: user.organizationId },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const names = new Map(people.map((p) => [p.id, fullName(p)]));
    return {
      total,
      items: rows.map((r) =>
        present(
          r,
          r.entityType === 'user' ? (names.get(r.entityId) ?? null) : null,
        ),
      ),
    };
  }

  /** Recomputes the hospital's chain in the database. */
  async check(organizationId: string): Promise<ChainCheck> {
    const [row] = await this.prisma.$queryRaw<
      Array<{
        entries: bigint | null;
        lastSeq: bigint | null;
        lastHash: string | null;
        brokenAt: bigint | null;
      }>
    >`SELECT * FROM "audit_chain_check"(${organizationId})`;
    const n = (v: bigint | null | undefined) =>
      v === null || v === undefined ? null : Number(v);
    return {
      entries: n(row?.entries) ?? 0,
      lastSeq: n(row?.lastSeq),
      lastHash: row?.lastHash ?? null,
      brokenAt: n(row?.brokenAt),
      checkedAt: new Date(),
    };
  }

  /**
   * Checks every hospital's chain (once a day, from the schedule) and tells
   * its administrators if an entry no longer matches.
   */
  async checkAll(): Promise<void> {
    const orgs = await this.prisma.organization.findMany({
      select: { id: true },
    });
    for (const { id } of orgs) {
      const result = await this.check(id);
      if (result.brokenAt === null) continue;
      this.logger.error(
        `Edit history of organization ${id} altered at entry ${result.brokenAt}`,
      );
      await this.prisma.$transaction((tx) =>
        bestEffort(tx, 'edit history notice', () =>
          notify(tx, {
            organizationId: id,
            kind: 'audit_chain_broken',
            severity: 'critical',
            title: 'The edit history has been altered',
            body: `Entry ${result.brokenAt} and the ones after it no longer match their hashes: an entry was changed or removed outside BioTrakr. Restore it from a backup and find out who has direct access to the database.`,
            link: '/registers?kind=audit',
            to: { roles: ['admin'] },
            dedupeKey: `audit-chain-broken:${result.brokenAt}`,
          }),
        ),
      );
    }
  }
}
