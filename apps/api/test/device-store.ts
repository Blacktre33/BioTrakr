/**
 * In-memory Prisma for the dashboard and PM schedule specs: assets, work
 * orders, users, notices and status history, with the query features those
 * services use (relation filters, nested selects, groupBy, ordering).
 */
import { ORG_A, ORG_B } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Rec = Record<string, any>;

export const DAY = 24 * 60 * 60 * 1000;
export const FAC_1 = '0f000000-0000-4000-8000-000000000001';
export const FAC_2 = '0f000000-0000-4000-8000-000000000002';

/** Asset ids are UUIDs (routes validate them). */
export const assetId = (n: number) =>
  `aa000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const orderId = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export function asset(n: number, fields: Rec = {}): Rec {
  return {
    id: assetId(n),
    organizationId: ORG_A,
    deletedAt: null,
    assetTagNumber: `TAG-${n}`,
    equipmentName: `Device ${n}`,
    assetStatus: 'ACTIVE',
    criticalityLevel: 'MEDIUM',
    currentFacilityId: FAC_1,
    pmFrequencyDays: 90,
    nextPmDueDate: null,
    lastPmDate: null,
    autoGenerateWorkOrders: true,
    pmProcedureDocument: null,
    updatedAt: new Date(0),
    ...fields,
  };
}

const same = (a: unknown, b: unknown) =>
  a instanceof Date && b instanceof Date
    ? a.getTime() === b.getTime()
    : a === b;
const isCond = (v: unknown) =>
  v !== null && typeof v === 'object' && !(v instanceof Date);

function test(value: any, cond: Rec): boolean {
  if (cond.equals !== undefined) {
    return cond.mode === 'insensitive'
      ? String(value).toLowerCase() === String(cond.equals).toLowerCase()
      : same(value, cond.equals);
  }
  if (cond.in && !cond.in.some((c: unknown) => same(value, c))) return false;
  if (cond.notIn && cond.notIn.some((c: unknown) => same(value, c)))
    return false;
  if (
    'not' in cond &&
    (cond.not === null ? value == null : same(value, cond.not))
  )
    return false;
  for (const op of ['lt', 'lte', 'gt', 'gte'] as const) {
    if (cond[op] === undefined) continue;
    if (value == null) return false;
    const [a, b] = [value, cond[op]].map((x) =>
      x instanceof Date ? x.getTime() : x,
    );
    if (op === 'lt' && !(a < b)) return false;
    if (op === 'lte' && !(a <= b)) return false;
    if (op === 'gt' && !(a > b)) return false;
    if (op === 'gte' && !(a >= b)) return false;
  }
  return true;
}

function sortBy(rows: Rec[], orderBy: Rec | Rec[] | undefined): Rec[] {
  const keys = (
    Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []
  ).map((o) => Object.entries(o)[0] as [string, 'asc' | 'desc']);
  const rank: Record<string, number> = {
    CRITICAL: 0,
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3,
  };
  const val = (v: any) =>
    v instanceof Date
      ? v.getTime()
      : typeof v === 'string' && v in rank
        ? rank[v]
        : v;
  return [...rows].sort((a, b) => {
    for (const [k, dir] of keys) {
      const [x, y] = [val(a[k]), val(b[k])];
      if (x === y) continue;
      // Postgres puts nulls last ascending.
      if (x == null) return 1;
      if (y == null) return -1;
      return (x < y ? -1 : 1) * (dir === 'desc' ? -1 : 1);
    }
    return 0;
  });
}

export function buildStore() {
  const assets: Rec[] = [];
  const orders: Rec[] = [];
  const statusChanges: Rec[] = [];
  const notifications: Rec[] = [];
  const users: Rec[] = [
    {
      id: 'user-admin',
      organizationId: ORG_A,
      firstName: 'Ada',
      lastName: 'Admin',
      role: 'admin',
      isActive: true,
      facilityId: null,
    },
    {
      id: 'user-technician',
      organizationId: ORG_A,
      firstName: 'Tara',
      lastName: 'Tech',
      role: 'technician',
      isActive: true,
      facilityId: FAC_1,
    },
    {
      id: 'user-tech-2',
      organizationId: ORG_A,
      firstName: 'Noor',
      lastName: 'North',
      role: 'technician',
      isActive: true,
      facilityId: FAC_2,
    },
    {
      id: 'user-clinical_staff',
      organizationId: ORG_A,
      firstName: 'Nia',
      lastName: 'Nurse',
      role: 'clinical_staff',
      isActive: true,
      facilityId: FAC_1,
    },
    {
      id: 'user-b',
      organizationId: ORG_B,
      firstName: 'Bo',
      lastName: 'Other',
      role: 'technician',
      isActive: true,
      facilityId: null,
    },
  ];

  const relations: Record<string, (row: Rec, where: Rec) => boolean> = {
    asset: (row, where) =>
      matches(assets.find((a) => a.id === row.assetId)!, where),
    maintenanceHistory: (row, where) => {
      const mine = orders.filter((o) => o.assetId === row.id);
      if (where.none) return !mine.some((o) => matches(o, where.none));
      if (where.some) return mine.some((o) => matches(o, where.some));
      return true;
    },
  };

  function matches(row: Rec, where: Rec = {}): boolean {
    return Object.entries(where).every(([k, v]) => {
      if (v === undefined) return true;
      if (k === 'AND') return (v as Rec[]).every((w) => matches(row, w));
      if (k === 'OR') return (v as Rec[]).some((w) => matches(row, w));
      if (relations[k] && isCond(v)) return relations[k](row, v);
      if (!isCond(v)) return v === null ? row[k] == null : same(row[k], v);
      return test(row[k], v);
    });
  }

  /** Related records, by relation name. */
  function related(
    row: Rec,
    key: string,
    args: Rec,
    of: 'asset' | 'order',
  ): unknown {
    if (of === 'asset') {
      if (key === 'currentFacility')
        return {
          facilityName:
            row.currentFacilityId === FAC_2 ? 'North Clinic' : 'City General',
        };
      if (key === 'currentRoom') return null;
      if (key === 'custodianDepartment') return { departmentName: 'ICU' };
      if (key === 'maintenanceHistory')
        return sortBy(
          orders.filter((o) => o.assetId === row.id && matches(o, args.where)),
          args.orderBy,
        )
          .slice(0, args.take ?? Infinity)
          .map((o) => project(o, args.select, 'order'));
      if (key === 'statusChanges')
        return sortBy(
          statusChanges.filter((c) => c.assetId === row.id),
          args.orderBy,
        )
          .slice(0, args.take ?? Infinity)
          .map((c) => project(c, args.select, 'change'));
    }
    if (of === 'order') {
      if (key === 'asset')
        return project(
          assets.find((a) => a.id === row.assetId)!,
          args.select,
          'asset',
        );
      if (key === 'assignedTechnician' || key === 'createdBy') {
        const u = users.find(
          (x) =>
            x.id ===
            row[
              key === 'createdBy' ? 'createdByUserId' : 'assignedTechnicianId'
            ],
        );
        return u ? project(u, args.select, 'user') : null;
      }
    }
    return undefined;
  }

  /** What Prisma returns for `select`: just those fields and relations. */
  function project(row: Rec, select: Rec | undefined, of: string): Rec {
    if (!select) return { ...row };
    const out: Rec = {};
    for (const [key, want] of Object.entries(select)) {
      if (!want) continue;
      out[key] =
        want === true && !(key in row) && of !== 'change' && of !== 'user'
          ? related(row, key, {}, of as 'asset' | 'order')
          : want === true
            ? row[key]
            : related(row, key, want as Rec, of as 'asset' | 'order');
    }
    return out;
  }

  function finder(rows: Rec[], of: 'asset' | 'order') {
    const findMany = async ({ where, select, orderBy, take }: Rec = {}) =>
      sortBy(
        rows.filter((r) => matches(r, where)),
        orderBy,
      )
        .slice(0, take ?? Infinity)
        .map((r) => project(r, select, of));
    return {
      findMany: jest.fn(findMany),
      findFirst: jest.fn(
        async (args: Rec = {}) =>
          (await findMany({ ...args, take: 1 }))[0] ?? null,
      ),
      count: jest.fn(
        async ({ where }: Rec = {}) =>
          rows.filter((r) => matches(r, where)).length,
      ),
    };
  }

  const newOrder = (data: Rec): Rec => ({
    id: orderId(orders.length + 1),
    startedAt: null,
    completedAt: null,
    assignedTechnicianId: null,
    isEmergency: false,
    pmDueDate: null,
    createdAt: new Date(),
    ...data,
  });

  const mock = {
    assets,
    orders,
    statusChanges,
    notifications,
    users,
    asset: {
      ...finder(assets, 'asset'),
      groupBy: jest.fn(async ({ by, where }: Rec) => {
        const counts = new Map<string, number>();
        for (const a of assets.filter((r) => matches(r, where))) {
          counts.set(a[by[0]], (counts.get(a[by[0]]) ?? 0) + 1);
        }
        return [...counts].map(([key, n]) => ({
          [by[0]]: key,
          _count: { _all: n },
        }));
      }),
    },
    maintenanceHistory: {
      ...finder(orders, 'order'),
      create: jest.fn(async ({ data }: Rec) => {
        const row = newOrder(data);
        orders.push(row);
        return row;
      }),
      // The unique (assetId, pmDueDate) index; nulls never collide.
      createManyAndReturn: jest.fn(async ({ data, skipDuplicates }: Rec) => {
        const created: Rec[] = [];
        for (const d of data as Rec[]) {
          const dup =
            d.pmDueDate != null &&
            orders.some(
              (o) => o.assetId === d.assetId && same(o.pmDueDate, d.pmDueDate),
            );
          if (dup && !skipDuplicates) throw new Error('P2002');
          if (dup) continue;
          const row = newOrder(d);
          orders.push(row);
          created.push(row);
        }
        return created;
      }),
    },
    user: {
      findMany: jest.fn(async ({ where }: Rec) =>
        users.filter((u) => matches(u, where)),
      ),
    },
    notification: {
      createMany: jest.fn(async ({ data }: Rec) => {
        for (const row of data as Rec[]) {
          const dup =
            row.dedupeKey &&
            notifications.some(
              (n) => n.userId === row.userId && n.dedupeKey === row.dedupeKey,
            );
          if (!dup) notifications.push(row);
        }
        return { count: data.length };
      }),
    },
    $executeRawUnsafe: jest.fn(async () => 0),
    // Row locks (SELECT … FOR UPDATE): nothing to wait for in memory.
    $queryRaw: jest.fn(async () => []),
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(mock),
    ),
  };
  return mock;
}

export type DeviceStore = ReturnType<typeof buildStore>;
