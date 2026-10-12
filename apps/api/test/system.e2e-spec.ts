import { INestApplication } from '@nestjs/common';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';

import {
  jobFailed,
  registerJob,
  resetJobHealth,
} from '../src/system/job-health';
import { SystemChecksService } from '../src/system/system-checks.service';
import { bearer, createTestApp, ORG_A } from './helpers';

const mockSendMail = jest.fn();
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: (...args: unknown[]) => mockSendMail(...args),
    close: jest.fn(),
  })),
}));

type Rec = Record<string, unknown>;
const HOUR = 3_600_000;

/** In-memory Prisma: users, notices, outside messages and system alerts. */
function buildPrisma() {
  const users: Rec[] = [
    {
      id: 'user-admin',
      organizationId: ORG_A,
      firstName: 'Asha',
      lastName: 'Admin',
      role: 'admin',
      isActive: true,
      passwordChangeRequired: false,
      email: 'asha@hospital.example',
      phone: '+919800000001',
      facilityId: null,
    },
    {
      id: 'user-engineer',
      organizationId: ORG_A,
      firstName: 'Eli',
      lastName: 'Eng',
      role: 'engineer',
      isActive: true,
      passwordChangeRequired: false,
      email: 'eli@hospital.example',
      phone: null,
      facilityId: null,
    },
  ];
  const alerts: Rec[] = [];
  const notifications: Rec[] = [];
  const outbound: Rec[] = [];

  const matches = (row: Rec, where: Rec = {}): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (v === undefined) return true;
      if (k === 'AND') return (v as Rec[]).every((w) => matches(row, w));
      if (k === 'OR') return (v as Rec[]).some((w) => matches(row, w));
      if (v === null) return row[k] == null;
      if (typeof v !== 'object' || v instanceof Date) {
        return v instanceof Date
          ? (row[k] as Date)?.getTime() === v.getTime()
          : row[k] === v;
      }
      const c = v as {
        in?: unknown[];
        not?: unknown;
        gte?: Date | number;
        equals?: string;
      };
      if (c.in) return c.in.includes(row[k]);
      if ('not' in c) return c.not === null ? row[k] != null : row[k] !== c.not;
      if (c.equals !== undefined)
        return String(row[k]).toLowerCase() === c.equals.toLowerCase();
      if (c.gte !== undefined)
        return row[k] != null && (row[k] as number) >= (c.gte as number);
      return true;
    });

  const mock = {
    users,
    alerts,
    notifications,
    outbound,
    organization: { findMany: jest.fn(async () => [{ id: ORG_A }]) },
    user: {
      findFirst: jest.fn(
        async ({ where }) => users.find((u) => matches(u, where)) ?? null,
      ),
      findMany: jest.fn(async ({ where }) =>
        users.filter((u) => matches(u, where)),
      ),
    },
    systemAlert: {
      findMany: jest.fn(async ({ where }) =>
        alerts.filter((a) => matches(a, where)).map((a) => ({ ...a })),
      ),
      updateMany: jest.fn(async ({ where, data }) => {
        const rows = alerts.filter((a) => matches(a, where));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      }),
      create: jest.fn(async ({ data }) => {
        if (alerts.some((a) => a.key === data.key)) {
          throw new Error('Unique constraint failed on key');
        }
        const row = { lastNotifiedAt: null, resolvedAt: null, ...data };
        alerts.push(row);
        return row;
      }),
    },
    notification: {
      createMany: jest.fn(async ({ data }) => {
        notifications.push(...(data as Rec[]));
        return { count: data.length };
      }),
    },
    outboundMessage: {
      createMany: jest.fn(async ({ data }) => {
        for (const row of data as Rec[]) {
          if (!outbound.some((o) => o.dedupeKey === row.dedupeKey)) {
            outbound.push({
              id: `ob${outbound.length + 1}`,
              attempts: 0,
              sentAt: null,
              failedAt: null,
              lastError: null,
              createdAt: new Date(),
              ...row,
            });
          }
        }
        return { count: data.length };
      }),
      findMany: jest.fn(async ({ where }) =>
        outbound.filter((o) => matches(o, where)),
      ),
    },
    $executeRawUnsafe: jest.fn(async () => 0),
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(mock),
    ),
  };
  return mock;
}

describe('System checks (e2e)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof buildPrisma>;
  let checks: SystemChecksService;
  const env = { ...process.env };
  const dir = mkdtempSync(join(tmpdir(), 'bt-system-'));
  const statusFile = join(dir, 'backup.json');

  const writeStatus = (over: Rec = {}, copy: Rec = {}) =>
    writeFileSync(
      statusFile,
      JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        loopStartedAt: new Date(Date.now() - 100 * HOUR).toISOString(),
        nextRunAt: null,
        keepDays: 14,
        lastAttemptAt: new Date().toISOString(),
        lastSuccessAt: new Date().toISOString(),
        lastError: null,
        lastFile: 'biotrakr_x.dump',
        lastSizeBytes: 1000,
        disk: { freeBytes: null, totalBytes: null },
        ...over,
        copy: {
          configured: true,
          lastAttemptAt: new Date().toISOString(),
          lastSuccessAt: new Date().toISOString(),
          lastError: null,
          disk: { freeBytes: null, totalBytes: null },
          ...copy,
        },
      }),
    );

  beforeEach(async () => {
    process.env.BACKUP_STATUS_FILE = statusFile;
    process.env.SMTP_HOST = 'mail.hospital.example';
    process.env.NOTIFY_EMAIL_FROM = 'biotrakr@hospital.example';
    writeStatus();
    prisma = buildPrisma();
    app = await createTestApp(prisma);
    checks = app.get(SystemChecksService);
    mockSendMail.mockReset().mockResolvedValue({ messageId: 'm' });
  });
  afterEach(async () => {
    await app.close();
    process.env = { ...env };
    resetJobHealth();
    jest.restoreAllMocks();
  });

  /** Only the problems these tests set up (the real disk is whatever it is). */
  const ours = (problems: { key: string }[]) =>
    problems.map((p) => p.key).filter((k) => k !== 'disk.server');

  it('tells administrators when a backup fails, reminds them daily, and says when it is fixed', async () => {
    const t0 = Date.now() + HOUR;
    writeStatus({ lastError: 'pg_dump: could not connect to server' });

    expect(ours(await checks.run(new Date(t0)))).toEqual(['backup.failed']);
    expect(prisma.alerts).toEqual([
      expect.objectContaining({ key: 'backup.failed', resolvedAt: null }),
    ]);
    // Administrators only, in the app and by email (critical).
    expect(prisma.notifications.map((n) => [n.userId, n.title])).toEqual([
      ['user-admin', 'The last backup failed'],
    ]);
    expect(prisma.notifications[0]).toMatchObject({
      kind: 'system_alert',
      severity: 'critical',
      link: '/settings?tab=system',
    });
    expect(prisma.outbound.map((o) => (o.payload as Rec).to)).toEqual([
      'asha@hospital.example',
    ]);

    // Five minutes later: nothing new.
    await checks.run(new Date(t0 + 5 * 60_000));
    expect(prisma.notifications).toHaveLength(1);

    // A day later: reminded.
    await checks.run(new Date(t0 + 25 * HOUR));
    expect(prisma.notifications.at(-1)!.title).toBe(
      'Still a problem: The last backup failed',
    );

    // Fixed: told once, and the alert is closed.
    writeStatus();
    await checks.run(new Date(t0 + 26 * HOUR));
    expect(prisma.notifications.at(-1)).toMatchObject({
      kind: 'system_resolved',
      severity: 'info',
      title: 'Fixed: The last backup failed',
    });
    expect(prisma.alerts[0].resolvedAt).toBeInstanceOf(Date);
    const told = prisma.notifications.length;
    await checks.run(new Date(t0 + 27 * HOUR));
    expect(prisma.notifications).toHaveLength(told);
  });

  it('notices a background job that keeps failing', async () => {
    registerJob('PM schedule', HOUR);
    jobFailed('PM schedule', new Error('relation "assets" does not exist'));
    const problems = await checks.findProblems(new Date(Date.now() + 4 * HOUR));
    expect(problems.find((p) => p.key === 'job.PM schedule')).toMatchObject({
      severity: 'critical',
      title: 'Background job not working: PM schedule',
    });
    expect(problems.find((p) => p.key === 'job.PM schedule')!.detail).toContain(
      'relation "assets" does not exist',
    );
  });

  it('notices outside messages that are not getting through, and settings that cannot work', async () => {
    process.env.NOTIFY_SMS_URL = 'https://sms.example.in/send?msg={text}';
    prisma.outbound.push({
      id: 'ob-x',
      organizationId: ORG_A,
      channel: 'email',
      payload: { to: 'eli@hospital.example', subject: 's', text: 't' },
      attempts: 8,
      sentAt: null,
      failedAt: new Date(),
      lastError: 'Mail server answered 535: authentication failed',
      createdAt: new Date(),
    });
    const problems = await checks.findProblems();
    expect(ours(problems)).toEqual(['config.sms', 'delivery.email']);
    expect(problems.find((p) => p.key === 'delivery.email')!.detail).toBe(
      '1 message(s) not delivered in the last 24 hours. Latest error: Mail server answered 535: authentication failed',
    );
  });

  it('warns when urgent reports can reach nobody outside the app', async () => {
    delete process.env.SMTP_HOST;
    delete process.env.NOTIFY_EMAIL_FROM;
    expect(ours(await checks.findProblems())).toEqual(['channels.none']);
  });

  it('calls the heartbeat address after each pass', async () => {
    process.env.HEARTBEAT_URL = 'https://status.hospital.example/api/push/abc';
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('ok'));
    await checks.run();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://status.hospital.example/api/push/abc',
      expect.anything(),
    );
    expect(checks.lastHeartbeat()).toMatchObject({ ok: true });
  });

  it('shows administrators the state of the installation', async () => {
    writeStatus({}, { configured: false });
    await request(app.getHttpServer())
      .get('/api/admin/system')
      .set(bearer('engineer'))
      .expect(403);
    const { body } = await request(app.getHttpServer())
      .get('/api/admin/system')
      .set({ Authorization: bearer('admin').Authorization })
      .expect(200);
    expect(ours(body.problems)).toEqual(['backup.no_copy']);
    expect(body.backup).toMatchObject({
      monitored: true,
      status: { lastFile: 'biotrakr_x.dump' },
    });
    expect(body.channels).toMatchObject({
      email: { on: true, server: 'mail.hospital.example' },
      sms: null,
      webhook: null,
    });
    expect(body.escalation).toEqual({
      afterMinutes: [15, 60],
      repeatMinutes: 60,
    });
  });

  it('sends a test alert to the administrator through each channel, and says what happened', async () => {
    process.env.NOTIFY_SMS_URL =
      'https://sms.example.in/send?to={to_digits}&msg={text}';
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{"status":"success"}'));
    const { body } = await request(app.getHttpServer())
      .post('/api/admin/system/test-alert')
      .set(bearer('admin'))
      .expect(200);
    expect(body).toEqual({
      email: { to: 'asha@hospital.example', ok: true },
      sms: { to: '+919800000001', ok: true },
      webhook: null,
    });
    expect(mockSendMail.mock.calls[0][0]).toMatchObject({
      to: 'asha@hospital.example',
      subject: '[BioTrakr] Test alert from BioTrakr',
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain('to=919800000001');

    // No mobile number on file: said plainly.
    prisma.users[0].phone = null;
    const again = await request(app.getHttpServer())
      .post('/api/admin/system/test-alert')
      .set(bearer('admin'))
      .expect(200);
    expect(again.body.sms).toEqual({
      to: null,
      ok: false,
      error:
        'Your account has no mobile number (Settings → People → your name)',
    });
  });
});
