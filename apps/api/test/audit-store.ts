/**
 * The edit history for specs with their own Prisma mock: entries are kept
 * in order and numbered per hospital, as the database's trigger would.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function auditStore() {
  const events: Array<Record<string, any>> = [];
  return {
    events,
    createMany: jest.fn(
      async ({ data }: { data: Array<Record<string, any>> }) => {
        for (const row of data) {
          const chain = events.filter(
            (e) => e.organizationId === row.organizationId,
          );
          events.push({
            id: `ae-${events.length + 1}`,
            seq: BigInt(chain.length + 1),
            occurredAt: new Date(),
            ...row,
          });
        }
        return { count: data.length };
      },
    ),
  };
}
