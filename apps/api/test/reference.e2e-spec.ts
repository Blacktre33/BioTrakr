import { INestApplication } from '@nestjs/common';
import {
  AssetStatus,
  CriticalityLevel,
  DeviceCategory,
  RiskClassification,
} from '@prisma/client';
import request from 'supertest';

import { bearer, createTestApp, ORG_A, ORG_B } from './helpers';

describe('Asset form reference data (e2e)', () => {
  let app: INestApplication;
  const prisma = {
    facility: {
      findMany: jest.fn(async () => [
        { id: 'f1', facilityName: 'City General', facilityCode: 'CG' },
      ]),
    },
    department: {
      findMany: jest.fn(async () => [
        { id: 'd1', departmentName: 'ICU', facilityId: 'f1' },
      ]),
    },
    user: {
      findMany: jest.fn(async () => [
        {
          id: 'u1',
          firstName: 'Nia',
          lastName: 'Nurse',
          jobTitle: 'Charge Nurse',
          facilityId: 'f1',
          departmentId: 'd1',
        },
      ]),
    },
  };

  beforeAll(async () => {
    app = await createTestApp(prisma);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => jest.clearAllMocks());

  const get = (role?: Parameters<typeof bearer>[0], org = ORG_A) => {
    const req = request(app.getHttpServer()).get('/api/reference/asset-form');
    return role ? req.set(bearer(role, org)) : req;
  };

  it('offers exactly the values the database accepts', async () => {
    const { body } = await get('clinical_staff').expect(200);
    const values = (key: string) =>
      body.enums[key].map((o: { value: string }) => o.value);

    expect(values('assetStatus')).toEqual(Object.values(AssetStatus));
    expect(values('deviceCategory')).toEqual(Object.values(DeviceCategory));
    expect(values('criticalityLevel')).toEqual(Object.values(CriticalityLevel));
    expect(values('riskClassification')).toEqual(
      Object.values(RiskClassification),
    );
    expect(body.enums.assetStatus).toContainEqual({
      value: 'QUARANTINED',
      label: 'Quarantined',
      hint: 'Do not use on patients',
    });
    expect(body.enums.riskClassification[1]).toMatchObject({
      label: 'Class II',
    });
  });

  it("returns only the caller's organization's facilities, departments and people", async () => {
    const { body } = await get('engineer', ORG_B).expect(200);

    expect(prisma.facility.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG_B, isActive: true },
      }),
    );
    expect(prisma.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { facility: { organizationId: ORG_B, isActive: true } },
      }),
    );
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG_B, isActive: true },
      }),
    );
    // Never expose credentials or contact details through a picker.
    const userSelect = (prisma.user.findMany.mock.calls[0] as unknown[])[0] as {
      select: Record<string, boolean>;
    };
    expect(Object.keys(userSelect.select)).not.toEqual(
      expect.arrayContaining(['passwordHash']),
    );
    expect(Object.keys(userSelect.select)).not.toEqual(
      expect.arrayContaining(['email']),
    );

    expect(body.facilities).toEqual([
      { id: 'f1', name: 'City General', code: 'CG' },
    ]);
    expect(body.custodians).toEqual([
      {
        id: 'u1',
        name: 'Nia Nurse',
        jobTitle: 'Charge Nurse',
        facilityId: 'f1',
        departmentId: 'd1',
      },
    ]);
  });

  it('requires a signed-in staff member', async () => {
    await get().expect(401);
    await get('integration').expect(403);
  });
});
