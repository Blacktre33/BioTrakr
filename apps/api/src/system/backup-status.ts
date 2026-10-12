import { readFile, statfs } from 'fs/promises';
import { dirname } from 'path';

/**
 * What the backup container last reported (deploy/scripts/backup.sh writes
 * it to a volume the API reads), and the problems it shows.
 */

export interface Problem {
  /** Stable per kind of problem, e.g. backup.failed */
  key: string;
  severity: 'critical' | 'warning';
  title: string;
  detail?: string;
}

export interface Disk {
  freeBytes: number | null;
  totalBytes: number | null;
}

export interface BackupStatus {
  version: number;
  updatedAt: string;
  loopStartedAt: string | null;
  nextRunAt: string | null;
  keepDays: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastFile: string | null;
  lastSizeBytes: number | null;
  disk: Disk;
  copy: {
    configured: boolean;
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
    disk: Disk;
  };
}

/** A nightly backup older than this has been missed. */
export const OVERDUE_HOURS = 26;
const HOUR = 60 * 60 * 1000;
const GB = 1024 ** 3;

/** Where the backup container's report is, if this server has one. */
export const backupStatusFile = () =>
  process.env.BACKUP_STATUS_FILE?.trim() || null;

export async function readBackupStatus(
  path: string,
): Promise<{ status: BackupStatus | null; error: string | null }> {
  try {
    const status = JSON.parse(await readFile(path, 'utf8')) as BackupStatus;
    if (status?.version !== 1 || typeof status.copy !== 'object') {
      return { status: null, error: `Unexpected contents in ${path}` };
    }
    return { status, error: null };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return {
      status: null,
      error:
        code === 'ENOENT'
          ? `No report from the backup service (${path} is missing)`
          : `Cannot read ${path}: ${(e as Error).message}`,
    };
  }
}

const hoursSince = (iso: string, now: Date) =>
  Math.floor((now.getTime() - new Date(iso).getTime()) / HOUR);

export const formatBytes = (bytes: number) =>
  bytes >= 100 * GB
    ? `${Math.round(bytes / GB)} GB`
    : bytes >= GB
      ? `${(bytes / GB).toFixed(1)} GB`
      : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;

/**
 * Low on space: a warning under 15% (or 5 GB) free, critical under 5%
 * (or 1 GB). Null when there is room, or nothing is known.
 */
export function diskProblem(
  key: string,
  what: string,
  disk: Disk | null | undefined,
): Problem | null {
  if (!disk?.freeBytes || !disk.totalBytes) return null;
  const { freeBytes: free, totalBytes: total } = disk;
  const severity =
    free < 0.05 * total || free < 1 * GB
      ? 'critical'
      : free < 0.15 * total || free < 5 * GB
        ? 'warning'
        : null;
  if (!severity) return null;
  return {
    key,
    severity,
    title: `${what} is nearly full`,
    detail: `${formatBytes(free)} free of ${formatBytes(total)} (${Math.round((100 * free) / total)}%).`,
  };
}

/** The filesystem holding `path` (on the server, Docker's volumes and so the database). */
export async function diskOf(path: string): Promise<Disk | null> {
  try {
    const s = await statfs(dirname(path));
    return { freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize };
  } catch {
    return null;
  }
}

export function backupProblems(
  read: { status: BackupStatus | null; error: string | null },
  now: Date,
  /** How long this API process has been up (the backup service may still be starting). */
  uptimeMs: number,
): Problem[] {
  const { status } = read;
  if (!status) {
    return uptimeMs < 30 * 60 * 1000
      ? []
      : [
          {
            key: 'backup.missing',
            severity: 'critical',
            title: 'Backups are not running',
            detail: `${read.error ?? 'No report from the backup service'}. Check the backup container: docker compose ps backup`,
          },
        ];
  }

  const problems: Problem[] = [];
  if (status.lastError) {
    problems.push({
      key: 'backup.failed',
      severity: 'critical',
      title: 'The last backup failed',
      detail: `${status.lastError}${status.lastSuccessAt ? ` Last good backup: ${status.lastSuccessAt}.` : ''}`,
    });
  } else if (
    status.lastSuccessAt
      ? hoursSince(status.lastSuccessAt, now) >= OVERDUE_HOURS
      : status.loopStartedAt &&
        hoursSince(status.loopStartedAt, now) >= OVERDUE_HOURS
  ) {
    problems.push({
      key: 'backup.overdue',
      severity: 'critical',
      title: status.lastSuccessAt
        ? `No backup for ${hoursSince(status.lastSuccessAt, now)} hours`
        : 'No backup has been made yet',
      detail:
        'Backups run every night. Check the backup container: docker compose logs backup',
    });
  }

  if (!status.copy.configured) {
    problems.push({
      key: 'backup.no_copy',
      severity: 'warning',
      title: 'Backups are kept only on this server',
      detail:
        'If its disk fails, the data and the backups are lost together. Set BACKUP_COPY_DIR to a network share or USB disk (see the install guide).',
    });
  } else if (status.copy.lastError) {
    problems.push({
      key: 'backup.copy_failed',
      severity: 'critical',
      title: 'Backups are not reaching the second location',
      detail: `${status.copy.lastError}${status.copy.lastSuccessAt ? ` Last copy: ${status.copy.lastSuccessAt}.` : ''}`,
    });
  } else if (
    // A missing copy is no news while the backup itself is the problem.
    problems.length === 0 &&
    (status.copy.lastSuccessAt
      ? hoursSince(status.copy.lastSuccessAt, now) >= OVERDUE_HOURS
      : // Turning the copy on restarts the backup service: give it a night.
        status.loopStartedAt &&
        hoursSince(status.loopStartedAt, now) >= OVERDUE_HOURS)
  ) {
    problems.push({
      key: 'backup.copy_overdue',
      severity: 'critical',
      title: status.copy.lastSuccessAt
        ? `No backup copied off this server for ${hoursSince(status.copy.lastSuccessAt, now)} hours`
        : 'No backup has been copied off this server yet',
    });
  }

  const backupDisk = diskProblem(
    'disk.backups',
    'The backup disk',
    status.disk,
  );
  if (backupDisk) problems.push(backupDisk);
  if (status.copy.configured) {
    const copyDisk = diskProblem(
      'disk.copy',
      'The second backup location',
      status.copy.disk,
    );
    if (copyDisk) problems.push(copyDisk);
  }
  return problems;
}
