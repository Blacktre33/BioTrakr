import { INestApplication } from '@nestjs/common';
import { createHash } from 'crypto';
import request from 'supertest';

import {
  asset,
  assetId,
  buildStore,
  DAY,
  type DeviceStore,
} from './device-store';
import { bearer, createTestApp, ORG_A, ORG_B } from './helpers';

const PDF = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n');
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);
const CALIBRATION = 'cc000000-0000-4000-8000-000000000001';
const CONTRACT = 'c0000000-0000-4000-8000-000000000001';
const WORK_ORDER = '00000000-0000-4000-8000-000000000099';

describe('Documents (e2e)', () => {
  let app: INestApplication;
  let store: DeviceStore;
  const tech = bearer('technician');
  const http = () => request(app.getHttpServer());

  const upload = (
    target: { targetType: string; targetId: string },
    file: { content: Buffer; name: string } | null = {
      content: PDF,
      name: 'NABL certificate PCL-0412.pdf',
    },
    extra: Record<string, string> = {},
    headers = tech,
  ) => {
    const req = http().post('/api/documents').set(headers);
    for (const [k, v] of Object.entries({ ...target, ...extra })) {
      req.field(k, v);
    }
    return file ? req.attach('file', file.content, file.name) : req;
  };

  beforeEach(async () => {
    store = buildStore();
    store.assets.push(asset(1), asset(2, { organizationId: ORG_B }));
    store.calibrations.push({
      id: CALIBRATION,
      assetId: assetId(1),
      calibratedAt: new Date(Date.now() - DAY),
      provider: 'EXTERNAL_LAB',
      result: 'PASS',
      recordedById: 'user-technician',
      recordedAt: new Date(),
      supersedesId: null,
    });
    store.vendors.push({
      id: 'ee000000-0000-4000-8000-000000000001',
      organizationId: ORG_A,
      vendorName: 'Philips',
    });
    store.contracts.push({
      id: CONTRACT,
      organizationId: ORG_A,
      vendorId: 'ee000000-0000-4000-8000-000000000001',
      contractType: 'CMC',
      contractNumber: 'CMC-1',
      startDate: new Date(Date.now() - 30 * DAY),
      endDate: new Date(Date.now() + 300 * DAY),
      terminatedAt: null,
      renewsId: null,
    });
    store.contractAssets.push({ contractId: CONTRACT, assetId: assetId(1) });
    store.orders.push({
      id: WORK_ORDER,
      assetId: assetId(1),
      workOrderType: 'CORRECTIVE_MAINTENANCE',
      workOrderStatus: 'COMPLETED',
    });
    app = await createTestApp(store);
  });
  afterEach(async () => {
    await app.close();
  });

  it('keeps a calibration certificate with its record, checked and fingerprinted', async () => {
    const res = await upload({
      targetType: 'calibration',
      targetId: CALIBRATION,
    }).expect(201);
    expect(res.body).toMatchObject({
      assetId: assetId(1),
      calibrationRecordId: CALIBRATION,
      category: 'CALIBRATION_CERTIFICATE',
      title: 'NABL certificate PCL-0412',
      fileName: 'NABL certificate PCL-0412.pdf',
      mimeType: 'application/pdf',
      sizeBytes: PDF.length,
      sha256: createHash('sha256').update(PDF).digest('hex'),
      uploadedBy: 'Tara Tech',
      withdrawal: null,
    });
    expect(res.body).not.toHaveProperty('content');

    const records = await http()
      .get(`/api/assets/${assetId(1)}/calibrations`)
      .set(tech)
      .expect(200);
    expect(records.body[0].documents).toBe(1);
  });

  it('takes only PDF, JPEG and PNG, judged by content, not name', async () => {
    const fake = await upload(
      { targetType: 'asset', targetId: assetId(1) },
      { content: Buffer.from('<script>alert(1)</script>'), name: 'report.pdf' },
    ).expect(400);
    expect(fake.body.message).toBe('Upload a PDF, JPEG or PNG file');

    const none = await upload(
      { targetType: 'asset', targetId: assetId(1) },
      null,
    ).expect(400);
    expect(none.body.message).toBe('Choose a file to upload');

    await upload(
      { targetType: 'asset', targetId: assetId(1) },
      {
        content: Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]),
        name: 'big.pdf',
      },
    ).expect(413);

    const photo = await upload(
      { targetType: 'asset', targetId: assetId(1) },
      { content: PNG, name: 'rating plate.jpg' },
      { category: 'INSTALLATION_REPORT', title: 'Installation photo' },
    ).expect(201);
    expect(photo.body).toMatchObject({
      mimeType: 'image/png',
      category: 'INSTALLATION_REPORT',
      title: 'Installation photo',
    });
  });

  it("lists everything about a device, and each record's own files", async () => {
    await upload({ targetType: 'calibration', targetId: CALIBRATION });
    await upload(
      { targetType: 'workOrder', targetId: WORK_ORDER },
      { content: PDF, name: 'Service report signed.pdf' },
    ).expect(201);
    await upload(
      { targetType: 'asset', targetId: assetId(1) },
      { content: PDF, name: 'Operator manual.pdf' },
      { category: 'MANUAL' },
    ).expect(201);
    const contract = await upload(
      { targetType: 'contract', targetId: CONTRACT },
      { content: PDF, name: 'CMC agreement.pdf' },
    ).expect(201);
    // A contract can cover several devices: it is not filed under one.
    expect(contract.body).toMatchObject({
      assetId: null,
      category: 'CONTRACT',
    });

    const device = await http()
      .get(`/api/documents?targetType=asset&targetId=${assetId(1)}`)
      .set(tech)
      .expect(200);
    expect(
      device.body.map((d: { category: string }) => d.category).sort(),
    ).toEqual(['CALIBRATION_CERTIFICATE', 'MANUAL', 'SERVICE_REPORT']);
    const forOrder = await http()
      .get(`/api/documents?targetType=workOrder&targetId=${WORK_ORDER}`)
      .set(tech)
      .expect(200);
    expect(forOrder.body).toHaveLength(1);

    const contracts = await http()
      .get('/api/contracts?status=all')
      .set(tech)
      .expect(200);
    expect(contracts.body[0].documents).toBe(1);
  });

  it('downloads the exact file, never to be run in the browser', async () => {
    const { body } = await upload({
      targetType: 'calibration',
      targetId: CALIBRATION,
    });
    const res = await http()
      .get(`/api/documents/${body.id}/file`)
      .set(bearer('viewer'))
      .buffer(true)
      .parse((r, done) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(Buffer.compare(res.body as Buffer, PDF)).toBe(0);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="NABL certificate PCL-0412.pdf"; filename*=UTF-8''NABL%20certificate%20PCL-0412.pdf`,
    );
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBe('sandbox');
  });

  it('is for biomed to add, biomed and auditors to read, within the hospital', async () => {
    const { body } = await upload({
      targetType: 'calibration',
      targetId: CALIBRATION,
    });
    await http()
      .get(`/api/documents?targetType=asset&targetId=${assetId(1)}`)
      .set(bearer('clinical_staff'))
      .expect(403);
    await http()
      .get(`/api/documents?targetType=asset&targetId=${assetId(1)}`)
      .set(bearer('viewer'))
      .expect(200);
    await upload(
      { targetType: 'asset', targetId: assetId(1) },
      undefined,
      {},
      bearer('viewer'),
    ).expect(403);
    await http()
      .get(`/api/documents/${body.id}/file`)
      .set(bearer('technician', ORG_B))
      .expect(404);
    await http()
      .get(`/api/documents?targetType=asset&targetId=${assetId(1)}`)
      .set(bearer('technician', ORG_B))
      .expect(404);
    await upload({ targetType: 'asset', targetId: assetId(2) }).expect(404);
    await upload({
      targetType: 'calibration',
      targetId: 'cc000000-0000-4000-8000-000000000999',
    }).expect(404);
  });

  it('withdraws a wrong file with a reason, keeping it on record', async () => {
    const { body } = await upload({
      targetType: 'calibration',
      targetId: CALIBRATION,
    });
    const short = await http()
      .post(`/api/documents/${body.id}/withdrawal`)
      .set(tech)
      .send({ reason: 'oops' })
      .expect(400);
    expect(JSON.stringify(short.body.message)).toMatch(/why the file/);

    const withdrawn = await http()
      .post(`/api/documents/${body.id}/withdrawal`)
      .set(tech)
      .send({ reason: 'Certificate for another pump' })
      .expect(201);
    expect(withdrawn.body.withdrawal).toMatchObject({
      reason: 'Certificate for another pump',
      withdrawnBy: 'Tara Tech',
    });
    await http()
      .post(`/api/documents/${body.id}/withdrawal`)
      .set(tech)
      .send({ reason: 'Certificate for another pump' })
      .expect(409);

    // Still listed, and still downloadable; no longer counted.
    const list = await http()
      .get(`/api/documents?targetType=calibration&targetId=${CALIBRATION}`)
      .set(tech)
      .expect(200);
    expect(list.body).toHaveLength(1);
    const records = await http()
      .get(`/api/assets/${assetId(1)}/calibrations`)
      .set(tech)
      .expect(200);
    expect(records.body[0].documents).toBe(0);
    expect(store.documents).toHaveLength(1);
  });
});
