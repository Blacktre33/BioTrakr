import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { ContractAlertsService } from '../src/contracts/contract-alerts.service';
import {
  asset,
  assetId,
  buildStore,
  DAY,
  type DeviceStore,
} from './device-store';
import { bearer, createTestApp, ORG_B } from './helpers';

describe('Contracts and vendors (e2e)', () => {
  let app: INestApplication;
  let store: DeviceStore;
  const admin = bearer('admin');
  const http = () => request(app.getHttpServer());
  /** Midday, `offset` days from today. */
  const day = (offset: number) => {
    const d = new Date(Date.now() + offset * DAY);
    d.setHours(12, 0, 0, 0);
    return d;
  };
  let vendorId: string;

  const contract = (over: Record<string, unknown> = {}) => ({
    vendorId,
    contractType: 'CMC',
    contractNumber: 'PH/CMC/2026/12',
    startDate: day(-30).toISOString(),
    endDate: day(335).toISOString(),
    annualValue: 120000,
    pmVisitsPerYear: 4,
    responseTimeHours: 24,
    deviceIds: [assetId(1), assetId(2)],
    ...over,
  });
  const create = (over: Record<string, unknown> = {}, headers = admin) =>
    http().post('/api/contracts').set(headers).send(contract(over));

  beforeEach(async () => {
    store = buildStore();
    store.assets.push(
      asset(1),
      asset(2),
      asset(3),
      asset(4, { warrantyEndDate: day(10) }),
      asset(9, { organizationId: ORG_B }),
    );
    app = await createTestApp(store);
    const res = await http()
      .post('/api/vendors')
      .set(admin)
      .send({
        vendorName: 'Philips Healthcare India',
        vendorType: 'SERVICE_PROVIDER',
        contactPerson: 'Rajesh Kumar',
        phone: '1800 102 2929',
        email: 'service@example.in',
      })
      .expect(201);
    vendorId = res.body.id;
  });
  afterEach(async () => {
    await app.close();
  });

  describe('vendors', () => {
    it('are kept per hospital, one per name', async () => {
      const dup = await http()
        .post('/api/vendors')
        .set(admin)
        .send({
          vendorName: 'philips healthcare india',
          vendorType: 'MANUFACTURER',
        })
        .expect(409);
      expect(dup.body.message).toBe('A vendor with this name already exists');

      await create().expect(201);
      const list = await http()
        .get('/api/vendors')
        .set(bearer('technician'))
        .expect(200);
      expect(list.body).toEqual([
        expect.objectContaining({
          vendorName: 'Philips Healthcare India',
          phone: '1800 102 2929',
          contracts: 1,
        }),
      ]);
      const other = await http()
        .get('/api/vendors')
        .set(bearer('technician', ORG_B))
        .expect(200);
      expect(other.body).toEqual([]);
    });

    it('check phone numbers and who may change them', async () => {
      const bad = await http()
        .post('/api/vendors')
        .set(admin)
        .send({
          vendorName: 'GE',
          vendorType: 'MANUFACTURER',
          phone: 'call us',
        })
        .expect(400);
      expect(JSON.stringify(bad.body.message)).toMatch(/phone number/);
      await http()
        .post('/api/vendors')
        .set(bearer('technician'))
        .send({ vendorName: 'GE', vendorType: 'MANUFACTURER' })
        .expect(403);
      const changed = await http()
        .patch(`/api/vendors/${vendorId}`)
        .set(bearer('engineer'))
        .send({ contactPerson: 'Anita Rao', phone: '' })
        .expect(200);
      expect(changed.body).toMatchObject({
        contactPerson: 'Anita Rao',
        phone: null,
      });
    });
  });

  describe('a contract', () => {
    it('covers devices for a period, with the vendor to call', async () => {
      const res = await create().expect(201);
      expect(res.body).toMatchObject({
        contractType: 'CMC',
        contractNumber: 'PH/CMC/2026/12',
        annualValue: 120000,
        status: 'active',
        daysLeft: 335,
        renewedById: null,
        previous: null,
        history: [],
        vendor: {
          vendorName: 'Philips Healthcare India',
          phone: '1800 102 2929',
        },
      });
      expect(res.body.devices.map((d: { id: string }) => d.id)).toEqual([
        assetId(1),
        assetId(2),
      ]);

      const cover = await http()
        .get(`/api/assets/${assetId(1)}/cover`)
        .set(bearer('clinical_staff'))
        .expect(200);
      expect(cover.body.contracts).toHaveLength(1);
      expect(cover.body.warranty).toMatchObject({
        active: false,
        daysLeft: null,
      });
      await http()
        .get(`/api/assets/${assetId(1)}/cover`)
        .set(bearer('technician', ORG_B))
        .expect(404);
    });

    it('offers a CMC typed into the device notes earlier, until it is entered as a contract', async () => {
      store.assets.find((a) => a.id === assetId(3))!.notes =
        '[CONTRACT_TRACKING]\n{"cmc": {"contractNumber": "CMC/2024/17", "costAnnual": 85000}}';
      const cover = () =>
        http()
          .get(`/api/assets/${assetId(3)}/cover`)
          .set(bearer('engineer'))
          .expect(200);
      expect((await cover()).body.earlier).toEqual([
        expect.objectContaining({
          contractType: 'CMC',
          contractNumber: 'CMC/2024/17',
          annualValue: 85000,
        }),
      ]);
      await create({
        contractNumber: 'CMC/2024/17',
        deviceIds: [assetId(3)],
      }).expect(201);
      expect((await cover()).body.earlier).toEqual([]);
    });

    it('needs a sensible period, a vendor and devices of this hospital', async () => {
      const backwards = await create({
        endDate: day(-60).toISOString(),
      }).expect(400);
      expect(backwards.body.message).toEqual([
        'The end date must be on or after the start date',
      ]);
      const foreign = await create({
        vendorId: '0e000000-0000-4000-8000-000000000001',
        deviceIds: [assetId(1), assetId(9)],
      }).expect(400);
      expect(foreign.body.message).toEqual([
        'Choose a vendor from the list',
        'Some of the chosen devices were not found. Reload and choose again.',
      ]);
      const none = await create({ deviceIds: [] }).expect(400);
      expect(JSON.stringify(none.body.message)).toMatch(/at least one device/);
      await create({}, bearer('technician')).expect(403);
    });

    it('never covers a device twice at once', async () => {
      await create().expect(201);
      const clash = await create({
        contractType: 'AMC',
        contractNumber: 'AMC-9',
        startDate: day(100).toISOString(),
        endDate: day(400).toISOString(),
        deviceIds: [assetId(2), assetId(3)],
      }).expect(400);
      expect(clash.body.message).toEqual([
        expect.stringMatching(
          /^Device 2 \(TAG-2\) is already covered by CMC PH\/CMC\/2026\/12 \(Philips Healthcare India\) from /,
        ),
      ]);
      // The day after it ends is free.
      await create({
        contractNumber: 'AMC-9',
        startDate: day(336).toISOString(),
        endDate: day(700).toISOString(),
        deviceIds: [assetId(2), assetId(3)],
      }).expect(201);
    });

    it('can be changed, devices included, until it is ended early', async () => {
      const { body } = await create().expect(201);
      const edited = await http()
        .patch(`/api/contracts/${body.id}`)
        .set(admin)
        .send(
          contract({
            deviceIds: [assetId(1), assetId(3)],
            annualValue: undefined,
          }),
        )
        .expect(200);
      expect(edited.body.devices.map((d: { id: string }) => d.id)).toEqual([
        assetId(1),
        assetId(3),
      ]);
      expect(edited.body.annualValue).toBeNull();

      const short = await http()
        .post(`/api/contracts/${body.id}/termination`)
        .set(admin)
        .send({ reason: 'no' })
        .expect(400);
      expect(JSON.stringify(short.body.message)).toMatch(
        /why the contract ends/,
      );
      const ended = await http()
        .post(`/api/contracts/${body.id}/termination`)
        .set(admin)
        .send({ reason: 'Vendor stopped servicing this model' })
        .expect(200);
      expect(ended.body).toMatchObject({
        status: 'terminated',
        terminationReason: 'Vendor stopped servicing this model',
      });
      await http()
        .post(`/api/contracts/${body.id}/termination`)
        .set(admin)
        .send({ reason: 'Vendor stopped servicing this model' })
        .expect(409);
      await http()
        .patch(`/api/contracts/${body.id}`)
        .set(admin)
        .send(contract())
        .expect(409);

      // Its devices are free for a new contract.
      await create({ contractNumber: 'NEW-1' }).expect(201);
    });

    it('is renewed by a new contract, keeping what each year cost', async () => {
      const { body: first } = await create({
        endDate: day(20).toISOString(),
      }).expect(201);
      const early = await http()
        .post(`/api/contracts/${first.id}/renewal`)
        .set(admin)
        .send(contract({ startDate: day(-31).toISOString() }))
        .expect(400);
      expect(early.body.message).toEqual([
        'A renewal must start after the contract it renews',
      ]);

      const renewed = await http()
        .post(`/api/contracts/${first.id}/renewal`)
        .set(admin)
        .send(
          contract({
            contractNumber: 'PH/CMC/2027/04',
            startDate: day(21).toISOString(),
            endDate: day(385).toISOString(),
            annualValue: 132000,
          }),
        )
        .expect(201);
      expect(renewed.body).toMatchObject({
        status: 'upcoming',
        annualValue: 132000,
        previous: { id: first.id, annualValue: 120000 },
        history: [
          expect.objectContaining({ id: first.id, annualValue: 120000 }),
        ],
      });
      await http()
        .post(`/api/contracts/${first.id}/renewal`)
        .set(admin)
        .send(
          contract({
            startDate: day(21).toISOString(),
            endDate: day(385).toISOString(),
          }),
        )
        .expect(409);

      const ending = await http()
        .get('/api/contracts?status=ending')
        .set(bearer('technician'))
        .expect(200);
      expect(ending.body).toEqual([]);
      const current = await http().get('/api/contracts').set(admin).expect(200);
      expect(current.body.map((c: { id: string }) => c.id)).toEqual([
        first.id,
        renewed.body.id,
      ]);
    });

    it('is listed by status', async () => {
      const { body: soon } = await create({
        endDate: day(45).toISOString(),
      }).expect(201);
      const { body: old } = await create({
        contractNumber: 'OLD',
        startDate: day(-400).toISOString(),
        endDate: day(-35).toISOString(),
      }).expect(201);
      const ids = async (status: string) =>
        (
          await http()
            .get(`/api/contracts?status=${status}`)
            .set(admin)
            .expect(200)
        ).body.map((c: { id: string }) => c.id);
      expect(await ids('ending')).toEqual([soon.id]);
      expect(await ids('expired')).toEqual([old.id]);
      expect(await ids('all')).toEqual([old.id, soon.id]);
      await http().get('/api/contracts?status=lapsed').set(admin).expect(400);
    });
  });

  describe('notices', () => {
    const run = () => app.get(ContractAlertsService).check();
    const notices = (kind: string) =>
      store.notifications.filter((n) => n.kind === kind);

    it('warn as a contract nears its end, once per step, and stop once renewed', async () => {
      const { body } = await create({ endDate: day(20).toISOString() }).expect(
        201,
      );
      await run();
      expect(notices('contract_expiring')).toEqual([
        expect.objectContaining({
          userId: 'user-admin',
          severity: 'warning',
          title: 'CMC with Philips Healthcare India ends in 20 days',
          link: `/contracts?id=${body.id}`,
          dedupeKey: `contract-expiry:${body.id}:30`,
        }),
      ]);
      // Hourly runs repeat nothing.
      await run();
      expect(notices('contract_expiring')).toHaveLength(1);

      await http()
        .post(`/api/contracts/${body.id}/renewal`)
        .set(admin)
        .send(
          contract({
            startDate: day(21).toISOString(),
            endDate: day(385).toISOString(),
          }),
        )
        .expect(201);
      store.notifications.length = 0;
      await run();
      expect(notices('contract_expiring')).toEqual([]);
    });

    it('warn as a warranty ends, unless a contract carries on after it', async () => {
      store.assets.push(
        asset(5, { warrantyEndDate: day(10) }),
        asset(6, { warrantyEndDate: day(-30) }), // long past
        asset(7, { warrantyEndDate: day(200) }), // not yet
      );
      await create({
        startDate: day(11).toISOString(),
        endDate: day(375).toISOString(),
        deviceIds: [assetId(5)],
      }).expect(201);
      await run();
      expect(notices('warranty_expiring')).toEqual([
        expect.objectContaining({
          title: 'Warranty ends in 10 days: Device 4 (TAG-4)',
          assetId: assetId(4),
          link: `/assets/${assetId(4)}`,
        }),
      ]);
    });
  });

  it("takes a warranty end date from the device's edit form", async () => {
    await http()
      .patch(`/api/assets/${assetId(3)}`)
      .set(admin)
      .send({ warrantyEndDate: '2027-03-31' })
      .expect(200);
    // As a Date: Prisma refuses a bare day.
    expect(
      store.assets.find((a) => a.id === assetId(3))!.warrantyEndDate,
    ).toEqual(new Date('2027-03-31'));
  });

  it('shows warranty and contract cover on the dashboard', async () => {
    store.assets.push(asset(5, { warrantyEndDate: day(-1) }));
    await create({ deviceIds: [assetId(1), assetId(4)] }).expect(201);
    await create({
      contractType: 'AMC',
      contractNumber: 'GE-AMC-1',
      endDate: day(60).toISOString(),
      annualValue: 30000,
      deviceIds: [assetId(2)],
    }).expect(201);
    const res = await http()
      .get('/api/dashboard')
      .set(bearer('engineer'))
      .expect(200);
    // In service: 1–5. Covered: 1, 4 (both), 2. Warranty: 4. Contract: 1, 2, 4.
    expect(res.body.cover).toEqual({
      devices: 5,
      covered: 3,
      coveredPercent: 60,
      underWarranty: 1,
      underContract: 3,
      endingSoonDays: 90,
      contractsEnding: 1,
      warrantiesEnding: 1,
      annualValue: 150000,
    });
  });
});
