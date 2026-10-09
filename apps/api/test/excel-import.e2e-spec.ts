import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import ExcelJS from 'exceljs';

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

/** An .xlsx file with one "Asset Entry" sheet: a header row, then the rows. */
async function workbook(
  rows: unknown[][],
  headers = HEADERS,
  edit?: (sheet: ExcelJS.Worksheet) => void,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Asset Entry');
  sheet.addRow(headers);
  rows.forEach((r) => sheet.addRow(r));
  edit?.(sheet);
  return Buffer.from(await wb.xlsx.writeBuffer());
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
    // Another organization's device: tags are per organization, so the
    // same tag is free here.
    {
      id: 'a-other',
      assetTagNumber: 'PUMP-B',
      organizationId: ORG_B,
      deletedAt: null,
    },
    // A deleted device of ours: its tag stays reserved.
    {
      id: 'a-gone',
      assetTagNumber: 'PUMP-GONE',
      organizationId: ORG_A,
      deletedAt: new Date('2026-01-01'),
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
        return existing.filter(
          (a) =>
            a.organizationId === where.organizationId &&
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
      await workbook([row('PUMP-1'), row('pump-old')]),
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
      await workbook([
        row('PUMP-1'),
        row('PUMP-2', { 'Risk Class*': 'IIb' }),
        row('PUMP-1'),
        row('PUMP-GONE'),
        row('PUMP-B'), // another organization's tag: fine
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
        message: expect.stringContaining('stays reserved'),
      }),
    ]);
    noWrites();
  });

  it('saves every row in one transaction when the file is valid', async () => {
    const { body } = await upload(
      'import',
      await workbook([row('PUMP-1'), row('PUMP-OLD')]),
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
    // A numeric cell formatted to show 00123, as Excel does for zero-padded tags.
    const zeros = await workbook([row('X')], HEADERS, (sheet) => {
      const cell = sheet.getCell('A2');
      cell.value = 123;
      cell.numFmt = '00000';
    });
    const { body } = await upload('validate', zeros).expect(200);
    expect(body.preview[0].assetTagNumber).toBe('00123');

    const twice = await upload(
      'validate',
      await workbook(
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
    const { body } = await upload(
      'import',
      await workbook([row('PUMP-1')]),
    ).expect(200);
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

  it('reads real Excel date cells', async () => {
    const dated = await workbook([row('PUMP-D')], HEADERS, (sheet) => {
      const cell = sheet.getCell(2, HEADERS.indexOf('Purchase Date*') + 1);
      cell.value = new Date(Date.UTC(2023, 5, 30));
      cell.numFmt = 'dd/mm/yyyy';
    });
    await upload('import', dated).expect(200);
    expect(prisma.tx.asset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        purchaseDate: new Date('2023-06-30T00:00:00Z'),
      }),
    });
  });

  it('refuses files that would unpack to something huge, before parsing them', async () => {
    const file = await workbook([row('PUMP-1')]);
    // Claim, in the zip's directory, that the first entry unpacks to 70 MB.
    const eocd = file.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const firstEntry = file.readUInt32LE(eocd + 16);
    file.writeUInt32LE(70 * 1024 * 1024, firstEntry + 24);

    const { body } = await upload('validate', file).expect(200);
    expect(body.valid).toBe(false);
    expect(body.errors[0].message).toMatch(/too large to import/);
  });

  it('stays fast on a sheet with a stray far-right cell and too many rows', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => row(`T-${i}`));
    const file = await workbook(rows, HEADERS, (sheet) => {
      sheet.getCell('XFD5').value = 'x';
    });
    const started = Date.now();
    const { body } = await upload('validate', file).expect(200);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(body.errors[0].message).toMatch(/2500 rows; the limit is 2000/);
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
      await workbook(
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
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Asset Entry',
      'Allowed Values',
      'Instructions',
    ]);
    const entry = wb.getWorksheet('Asset Entry')!;
    const headers = (entry.getRow(1).values as unknown[])
      .slice(1)
      .map((h) => String(h));
    // Coded columns offer a drop-down of the allowed values.
    const statusCol = headers.indexOf('Status*') + 1;
    expect(entry.getCell(2, statusCol).dataValidation).toMatchObject({
      type: 'list',
      formulae: [expect.stringContaining('Allowed Values')],
    });

    // Fill the template's own header row, so its column names are what is tested.
    const sample = Object.fromEntries(
      HEADERS.map((h, i) => [h.replace('*', ''), row('PUMP-9')[i]]),
    );
    const filled = await workbook(
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
    await upload(
      'import',
      await workbook([row('PUMP-1')]),
      'technician',
    ).expect(403);
    noWrites();
  });
});
