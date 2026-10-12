import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  backupProblems,
  diskProblem,
  readBackupStatus,
  type BackupStatus,
} from './backup-status';

const GB = 1024 ** 3;
const now = new Date('2026-10-13T06:00:00Z');
const hoursAgo = (h: number) =>
  new Date(now.getTime() - h * 3_600_000).toISOString();
const UP = 60 * 60 * 1000; // API up an hour

function status(over: Partial<BackupStatus> = {}): BackupStatus {
  return {
    version: 1,
    updatedAt: hoursAgo(4),
    loopStartedAt: hoursAgo(100),
    nextRunAt: hoursAgo(-20),
    keepDays: 14,
    lastAttemptAt: hoursAgo(4),
    lastSuccessAt: hoursAgo(4),
    lastError: null,
    lastFile: 'biotrakr_2026-10-13_020000.dump',
    lastSizeBytes: 12_345_678,
    disk: { freeBytes: 400 * GB, totalBytes: 500 * GB },
    copy: {
      configured: true,
      lastAttemptAt: hoursAgo(4),
      lastSuccessAt: hoursAgo(4),
      lastError: null,
      disk: { freeBytes: 1500 * GB, totalBytes: 2000 * GB },
    },
    ...over,
  };
}
const keys = (s: BackupStatus | null, uptime = UP) =>
  backupProblems({ status: s, error: s ? null : 'missing' }, now, uptime).map(
    (p) => `${p.key}:${p.severity}`,
  );

describe('backup problems', () => {
  it('finds none when last night’s backup and its copy are fine', () => {
    expect(keys(status())).toEqual([]);
  });

  it('says so when the backup service has not reported, once it has had time to', () => {
    expect(keys(null, 5 * 60_000)).toEqual([]);
    expect(keys(null)).toEqual(['backup.missing:critical']);
  });

  it('reports a failed backup with the reason and the last good one', () => {
    const [p] = backupProblems(
      {
        status: status({
          lastError: 'pg_dump: connection refused',
          lastSuccessAt: hoursAgo(28),
        }),
        error: null,
      },
      now,
      UP,
    );
    expect(p).toMatchObject({
      key: 'backup.failed',
      severity: 'critical',
      title: 'The last backup failed',
    });
    expect(p.detail).toContain('pg_dump: connection refused');
    expect(p.detail).toContain(hoursAgo(28));
  });

  it('notices backups that silently stopped', () => {
    expect(
      backupProblems(
        { status: status({ lastSuccessAt: hoursAgo(30) }), error: null },
        now,
        UP,
      )[0],
    ).toMatchObject({ key: 'backup.overdue', title: 'No backup for 30 hours' });
    expect(
      backupProblems(
        {
          status: status({ lastSuccessAt: null, loopStartedAt: hoursAgo(27) }),
          error: null,
        },
        now,
        UP,
      )[0],
    ).toMatchObject({ title: 'No backup has been made yet' });
    // A new install waits for its first night.
    expect(
      keys(status({ lastSuccessAt: null, loopStartedAt: hoursAgo(3) })),
    ).toEqual([]);
  });

  it('warns while backups stay on this server, and alarms when the copy fails', () => {
    const local = status();
    local.copy = {
      ...local.copy,
      configured: false,
      disk: { freeBytes: null, totalBytes: null },
    };
    expect(keys(local)).toEqual(['backup.no_copy:warning']);

    const failing = status();
    failing.copy = {
      ...failing.copy,
      lastError:
        'copy location is not mounted (no .biotrakr-backup-target file)',
    };
    expect(keys(failing)).toEqual(['backup.copy_failed:critical']);

    const stale = status();
    stale.copy = { ...stale.copy, lastSuccessAt: hoursAgo(50) };
    expect(keys(stale)).toEqual(['backup.copy_overdue:critical']);

    // Just turned on (the backup service restarted): waits for its first night.
    const fresh = status({ loopStartedAt: hoursAgo(2) });
    fresh.copy = { ...fresh.copy, lastAttemptAt: null, lastSuccessAt: null };
    expect(keys(fresh)).toEqual([]);
    const never = status({ loopStartedAt: hoursAgo(30) });
    never.copy = { ...never.copy, lastAttemptAt: null, lastSuccessAt: null };
    expect(keys(never)).toEqual(['backup.copy_overdue:critical']);
  });

  it('watches the space left on both backup disks', () => {
    const s = status({ disk: { freeBytes: 20 * GB, totalBytes: 500 * GB } });
    s.copy = { ...s.copy, disk: { freeBytes: 0.5 * GB, totalBytes: 100 * GB } };
    expect(keys(s)).toEqual(['disk.backups:critical', 'disk.copy:critical']);
  });
});

describe('disk space', () => {
  it('warns below 15% or 5 GB free, and is critical below 5% or 1 GB', () => {
    const at = (free: number, total: number) =>
      diskProblem('disk.x', 'The disk', {
        freeBytes: free * GB,
        totalBytes: total * GB,
      })?.severity ?? null;
    expect(at(200, 1000)).toBeNull();
    expect(at(100, 1000)).toBe('warning');
    expect(at(40, 1000)).toBe('critical');
    expect(at(4, 20)).toBe('warning'); // 20% but under 5 GB
    expect(at(0.8, 10)).toBe('critical');
    expect(diskProblem('disk.x', 'The disk', null)).toBeNull();
  });
});

describe('reading the status file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bt-status-'));

  it('reads what backup.sh writes', async () => {
    const path = join(dir, 'ok.json');
    writeFileSync(path, JSON.stringify(status()));
    expect((await readBackupStatus(path)).status?.lastFile).toBe(
      'biotrakr_2026-10-13_020000.dump',
    );
  });

  it('explains a missing or unreadable file instead of throwing', async () => {
    expect(await readBackupStatus(join(dir, 'none.json'))).toEqual({
      status: null,
      error: `No report from the backup service (${join(dir, 'none.json')} is missing)`,
    });
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, '{"version":1');
    expect((await readBackupStatus(bad)).error).toContain('Cannot read');
  });
});
