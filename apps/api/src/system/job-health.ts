/**
 * When each background job in this process last finished well. The jobs
 * run on timers inside the API, so a job that keeps failing (or hangs) is
 * otherwise only visible in the logs; the system checks read this and tell
 * administrators.
 */

export interface JobHealth {
  name: string;
  /** How often it is meant to run. */
  everyMs: number;
  startedAt: Date;
  lastOkAt: Date | null;
  lastErrorAt: Date | null;
  lastError: string | null;
  failuresInARow: number;
}

const jobs = new Map<string, JobHealth>();

/** Called when a job's timer is set up. */
export function registerJob(name: string, everyMs: number): void {
  if (!jobs.has(name)) {
    jobs.set(name, {
      name,
      everyMs,
      startedAt: new Date(),
      lastOkAt: null,
      lastErrorAt: null,
      lastError: null,
      failuresInARow: 0,
    });
  }
}

export function jobSucceeded(name: string, at = new Date()): void {
  const job = jobs.get(name);
  if (!job) return;
  job.lastOkAt = at;
  job.failuresInARow = 0;
}

export function jobFailed(name: string, error: unknown, at = new Date()): void {
  const job = jobs.get(name);
  if (!job) return;
  job.lastErrorAt = at;
  job.lastError = (error as Error)?.message ?? String(error);
  job.failuresInARow++;
}

export function jobHealth(): JobHealth[] {
  return [...jobs.values()].map((j) => ({ ...j }));
}

/**
 * A job is late when it has not finished well for three of its intervals
 * (at least ten minutes): failing every time, or stuck.
 */
export function isLate(job: JobHealth, now = new Date()): boolean {
  const since = (job.lastOkAt ?? job.startedAt).getTime();
  return now.getTime() - since > Math.max(3 * job.everyMs, 10 * 60_000);
}

/** For tests. */
export function resetJobHealth(): void {
  jobs.clear();
}
