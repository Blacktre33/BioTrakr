import type { Prisma } from '@prisma/client';

import { actorOf, audit, auditedTransaction, systemActor } from './audit';
import { changesBetween, listed, shown, words } from './changes';

/* eslint-disable @typescript-eslint/no-explicit-any */
function fakePrisma() {
  const written: any[] = [];
  const tx: any = {
    auditEvent: {
      createMany: jest.fn(async ({ data }: any) => {
        written.push(...data);
        return { count: data.length };
      }),
    },
    room: {
      findMany: jest.fn(async () => [
        { id: 'r1', roomName: 'ICU bay 3', roomCode: 'ICU-3' },
        { id: 'r2', roomName: 'Theatre 2', roomCode: 'OT-2' },
      ]),
    },
  };
  return {
    tx: tx as Prisma.TransactionClient,
    written,
    prisma: { $transaction: jest.fn((fn: any) => fn(tx)) } as any,
  };
}

const engineer = actorOf({
  userId: 'u1',
  organizationId: 'org',
  role: 'engineer',
  email: 'e@x',
});

describe('auditedTransaction', () => {
  it('writes the entries noted during the work, last and in order', async () => {
    const { prisma, written, tx } = fakePrisma();
    const result = await auditedTransaction(prisma, async (t) => {
      audit(t, engineer, {
        action: 'asset.created',
        entityType: 'asset',
        entityId: 'a1',
        assetId: 'a1',
        summary: 'Added TAG-1',
      });
      audit(t, systemActor('org'), {
        action: 'work_order.opened',
        entityType: 'work_order',
        entityId: 'w1',
        summary: 'Opened by the schedule',
        reason: '  ',
      });
      expect(tx.auditEvent.createMany).not.toHaveBeenCalled();
      return 'done';
    });
    expect(result).toBe('done');
    expect(tx.auditEvent.createMany).toHaveBeenCalledTimes(1);
    expect(written).toEqual([
      {
        organizationId: 'org',
        actorId: 'u1',
        actorRole: 'engineer',
        action: 'asset.created',
        entityType: 'asset',
        entityId: 'a1',
        assetId: 'a1',
        summary: 'Added TAG-1',
        reason: null,
      },
      expect.objectContaining({ actorId: null, actorRole: 'system' }),
    ]);
  });

  it('writes nothing when the work fails, so the change and its history go together', async () => {
    const { prisma, tx } = fakePrisma();
    await expect(
      auditedTransaction(prisma, async (t) => {
        audit(t, engineer, {
          action: 'asset.updated',
          entityType: 'asset',
          entityId: 'a1',
          summary: 'Edited',
        });
        throw new Error('conflict');
      }),
    ).rejects.toThrow('conflict');
    expect(tx.auditEvent.createMany).not.toHaveBeenCalled();
  });

  it('refuses an entry outside an audited transaction, so no change goes unrecorded', () => {
    const { tx } = fakePrisma();
    expect(() =>
      audit(tx, engineer, {
        action: 'asset.updated',
        entityType: 'asset',
        entityId: 'a1',
        summary: 'Edited',
      }),
    ).toThrow(/outside an audited transaction/);
  });
});

describe('changesBetween', () => {
  it('lists only what changed, as it reads on screen', async () => {
    const { tx } = fakePrisma();
    const changes = await changesBetween(
      tx,
      {
        currentRoomId: 'r1',
        criticalityLevel: 'MEDIUM',
        warrantyEndDate: new Date('2027-03-31T00:00:00Z'),
        requiresCalibration: false,
        equipmentName: 'Syringe pump',
      },
      {
        currentRoomId: 'r2',
        criticalityLevel: 'HIGH',
        // The same day, sent as a date string: no change.
        warrantyEndDate: '2027-03-31',
        requiresCalibration: true,
        equipmentName: 'Syringe pump',
        notes: undefined,
      },
    );
    expect(changes).toEqual([
      {
        field: 'currentRoomId',
        label: 'Room',
        from: 'ICU bay 3 (ICU-3)',
        to: 'Theatre 2 (OT-2)',
      },
      {
        field: 'criticalityLevel',
        label: 'Criticality',
        from: 'Medium',
        to: 'High',
      },
      {
        field: 'requiresCalibration',
        label: 'Needs calibration',
        from: 'No',
        to: 'Yes',
      },
    ]);
    expect(listed(changes)).toBe('Room, Criticality and Needs calibration');
  });

  it('says that personal details changed, never what they were', async () => {
    const { tx } = fakePrisma();
    expect(
      await changesBetween(
        tx,
        { phone: '+919800000001', role: 'technician' },
        { phone: '+919800000002', role: 'engineer' },
      ),
    ).toEqual([
      { field: 'phone', label: 'Phone', from: null, to: null, hidden: true },
      { field: 'role', label: 'Role', from: 'Technician', to: 'Engineer' },
    ]);
  });
});

describe('shown', () => {
  it('formats rupees, words and long text', () => {
    expect(shown('annualValue', 132000)).toBe('₹1,32,000.00');
    expect(shown('electricalClass', 'CLASS_II')).toBe('Class II');
    expect(shown('notes', '')).toBeNull();
    expect(shown('notes', 'x'.repeat(600))).toHaveLength(500);
    expect(shown('devices', ['MON-1', 'VENT-7'])).toBe('MON-1, VENT-7');
    expect(words('IN_MAINTENANCE')).toBe('In maintenance');
  });
});
