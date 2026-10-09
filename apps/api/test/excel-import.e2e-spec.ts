import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as XLSX from 'xlsx';

import { bearer, createTestApp, ORG_A, ORG_B } from './helpers';

const HEADERS = [
  'Asset Tag*',
  'Equipment Name*',
  'Manufacturer*',
  'Model Number*',
  'Serial Number',
  'Category*',
  'Criticality*',
  'Risk Class*',
  'Status*',
  'Facility Code*',
  'Department Code*',
  'Purchase Date*',
  'Purchase Price',
];

const row = (tag: string, overrides: Partial<Record<string, unknown>> = {}) => {
  const base: Record<string, unknown> = {
    'Asset Tag*': tag,
    'Equipment Name*': 'Infusion pump',
    'Manufacturer*': 'BD',
    'Model Number*': 'Alaris',
    'Serial Number': `SN-${tag}`,
    'Category*': 'Therapeutic',
    'Criticality*': 'High',
    'Risk Class*': 'Class II',
    'Status*': 'Active',
    'Facility Code*': 'CG',
    'Department Code*': 'ICU',
    'Purchase Date*': '2024-01-15',
    'Purchase Price': 50000,
    ...overrides,
  };
  return HEADERS.map((h) => base[h] ?? null);
};

function workbook(rows: unknown[][], headers = HEADERS): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([headers, ...rows]),
    'Asset Entry',
  );
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function buildPrisma() {
  const existing = [
    // Already in this organization: an import row with this tag updates it.
    {
      id: 'a-existing',
      assetTagNumber: 'PUMP-OLD',
      organizationId: ORG_A,
      deletedAt: null,
      // Taken out of use after a fault; an old spreadsheet must not release it.
      assetStatus: 'QUARANTINED',
      equipmentName: 'Infusion pump',
      manufacturer: 'BD',
      modelNumber: 'Alaris',
      serialNumber: 'SN-PUMP-OLD',
      deviceCategory: 'THERAPEUTIC',
      criticalityLevel: 'HIGH',
      riskClassification: 'CLASS_II',
      currentFacilityId: 'f1',
      custodianDepartmentId: 'd1',
      purchaseDate: new Date('2024-01-15T00:00:00Z'),
      purchaseCost: 40000,
      usefulLifeYears: 7,
      notes: 'Keep me',
    },
    // Belongs to another organization: the tag is taken.
    {
      id: 'a-other',
      assetTagNumber: 'PUMP-B',
      organizationId: ORG_B,
      deletedAt: null,
    },
  ];
  const tx = {
    asset: {
      create: jest.fn(async ({ data }) => ({ id: 'new', ...data })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
  };
  return {
    tx,
    facility: {
      findMany: jest.fn(async ({ where }) =>
        where.organizationId === ORG_A
          ? [{ id: 'f1', facilityCode: 'CG', facilityName: 'City General' }]
          : [],
      ),
    },
    department: {
      findMany: jest.fn(async () => [
        {
          id: 'd1',
          facilityId: 'f1',
          departmentCode: 'ICU',
          departmentName: 'Intensive Care',
        },
      ]),
    },
    asset: {
      findMany: jest.fn(async ({ where }) => {
        const wanted = (
          where.OR as Array<{ assetTagNumber: { equals: string } }>
        ).map((c) => c.assetTagNumber.equals.toLowerCase());
        return existing.filter((a) =>
          wanted.includes(a.assetTagNumber.toLowerCase()),
        );
      }),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
}

describe('Excel import (e2e)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(async () => {
    prisma = buildPrisma();
    app = await createTestApp(prisma);
  });
  afterEach(async () => {
    await app.close();
  });

  const upload = (
    path: 'validate' | 'import',
    file: Buffer,
    role: 'engineer' | 'technician' = 'engineer',
  ) =>
    request(app.getHttpServer())
      .post(`/api/v1/assets/${path}`)
      .set(bearer(role))
      .attach('file', file, 'assets.xlsx');

  const noWrites = () => {
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.asset.create).not.toHaveBeenCalled();
    expect(prisma.asset.updateMany).not.toHaveBeenCalled();
  };

  it('checks a file and previews it without saving anything', async () => {
    const { body } = await upload(
      'validate',
      workbook([row('PUMP-1'), row('pump-old')]),
    ).expect(200);

    expect(body).toMatchObject({
      valid: true,
      totalRows: 2,
      toCreate: 1,
      toUpdate: 1,
      errors: [],
      preview: [
        {
          row: 2,
          action: 'create',
          assetTagNumber: 'PUMP-1',
          facility: 'City General',
          department: 'Intensive Care',
          status: 'Active',
          category: 'Therapeutic',
        },
        // Matched ignoring case; keeps the stored spelling so the label still scans.
        {
          row: 3,
          action: 'update',
          assetTagNumber: 'PUMP-OLD',
          // Only what differs; status is protected, blank columns are left alone.
          changes: ['Serial Number', 'Purchase Price'],
        },
      ],
    });
    noWrites();
  });

  it('saves nothing when any row has a problem, and says which', async () => {
    const { body } = await upload(
      'import',
      workbook([
        row('PUMP-1'),
        row('PUMP-2', { 'Risk Class*': 'IIb' }),
        row('PUMP-1'),
        row('PUMP-B'),
      ]),
    ).expect(200);

    expect(body).toMatchObject({ success: false, imported: 0, failed: 3 });
    expect(body.errors).toEqual([
      expect.objectContaining({ row: 3, field: 'Risk Class', value: 'IIb' }),
      expect.objectContaining({
        row: 4,
        field: 'Asset Tag',
        message: 'Same tag as row 2',
      }),
      expect.objectContaining({
        row: 5,
        field: 'Asset Tag',
        message: 'This asset tag is already in use',
      }),
    ]);
    noWrites();
  });

  it('saves every row in one transaction when the file is valid', async () => {
    const { body } = await upload(
      'import',
      workbook([row('PUMP-1'), row('PUMP-OLD')]),
    ).expect(200);

    expect(body).toMatchObject({
      success: true,
      imported: 2,
      created: 1,
      updated: 1,
      failed: 0,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.tx.asset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assetTagNumber: 'PUMP-1',
        organizationId: ORG_A,
        primaryCustodianId: 'user-engineer',
        createdById: 'user-engineer',
        currentFacilityId: 'f1',
        custodianDepartmentId: 'd1',
        deviceCategory: 'THERAPEUTIC',
        riskClassification: 'CLASS_II',
        assetStatus: 'ACTIVE',
        purchaseCost: 50000,
      }),
    });
    expect(prisma.tx.asset.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'a-existing',
        organizationId: ORG_A,
        deletedAt: null,
        // Only if the status is still what the check saw.
        assetStatus: 'QUARANTINED',
      },
      data: expect.objectContaining({
        assetTagNumber: 'PUMP-OLD',
        updatedById: 'user-engineer',
      }),
    });
    const update = prisma.tx.asset.updateMany.mock.calls[0] as unknown as [
      { data: Record<string, unknown> },
    ];
    // The quarantined device stays quarantined, and blank cells wipe nothing.
    expect(update[0].data).not.toHaveProperty('assetStatus');
    expect(update[0].data).not.toHaveProperty('notes');
    expect(update[0].data).not.toHaveProperty('usefulLifeYears');
    expect(body.warnings).toContainEqual({
      row: 3,
      message: expect.stringContaining('Status stays Quarantined'),
    });
  });

  it('keeps leading zeros in tags and rejects a repeated column', async () => {
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([HEADERS, row('X')]);
    // A numeric cell formatted to show 00123, as Excel does for zero-padded tags.
    sheet['A2'] = { t: 'n', v: 123, z: '00000', w: '00123' };
    XLSX.utils.book_append_sheet(wb, sheet, 'Asset Entry');
    const { body } = await upload(
      'validate',
      XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }),
    ).expect(200);
    expect(body.preview[0].assetTagNumber).toBe('00123');

    const twice = await upload(
      'validate',
      workbook(
        [[...row('PUMP-1'), 'Quarantined']],
        [...HEADERS, 'Asset Status'],
      ),
    ).expect(200);
    expect(twice.body).toMatchObject({
      valid: false,
      errors: [
        { field: 'Status', message: expect.stringContaining('more than once') },
      ],
    });
  });

  it('rolls back and explains when a tag is taken mid-import', async () => {
    prisma.tx.asset.create.mockRejectedValueOnce(
      Object.assign(new Error('Unique'), { code: 'P2002' }),
    );
    const { body } = await upload('import', workbook([row('PUMP-1')])).expect(
      200,
    );
    expect(body).toMatchObject({
      success: false,
      imported: 0,
      errors: [
        {
          row: 2,
          field: 'Asset Tag',
          message: expect.stringContaining('added by someone else'),
        },
      ],
    });
  });

  it('names the columns an old template is missing', async () => {
    const old = [
      'Asset Tag*',
      'Asset Type*',
      'Asset Category*',
      'Manufacturer*',
      'Model Number*',
      'Facility Code*',
      'Department Code',
      'Status*',
      'Condition*',
      'Acquisition Date',
    ];
    const { body } = await upload(
      'validate',
      workbook(
        [
          [
            'T1',
            'Pump',
            'Therapeutic',
            'BD',
            'A',
            'CG',
            'ICU',
            'Available',
            'Good',
            '2024-01-01',
          ],
        ],
        old,
      ),
    ).expect(200);
    expect(body.valid).toBe(false);
    expect(body.errors.map((e: { field: string }) => e.field)).toEqual([
      'Criticality',
      'Risk Class',
    ]);
  });

  it('round-trips the downloadable template', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/assets/template')
      .set(bearer('engineer'))
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const wb = XLSX.read(res.body, { type: 'buffer' });
    expect(wb.SheetNames).toEqual([
      'Asset Entry',
      'Instructions',
      'Allowed Values',
    ]);
    const [headers] = XLSX.utils.sheet_to_json<string[]>(
      wb.Sheets['Asset Entry'],
      { header: 1 },
    );

    // Fill the template's own header row, so its column names are what is tested.
    const sample = Object.fromEntries(
      HEADERS.map((h, i) => [h.replace('*', ''), row('PUMP-9')[i]]),
    );
    const filled = workbook(
      [headers.map((h) => sample[h.replace('*', '')] ?? null)],
      headers,
    );
    const { body } = await upload('validate', filled).expect(200);
    expect(body.valid).toBe(true);
  });

  it('accepts only .xlsx files from asset editors', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/assets/validate')
      .set(bearer('engineer'))
      .attach('file', Buffer.from('a,b'), 'assets.csv')
      .expect(400);
    await upload('import', workbook([row('PUMP-1')]), 'technician').expect(403);
    noWrites();
  });
});
