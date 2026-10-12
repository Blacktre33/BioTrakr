import { api } from "./client";

export interface SystemProblem {
  key: string;
  severity: "critical" | "warning";
  title: string;
  detail?: string;
  /** When administrators were first told; null until the next check records it. */
  since: string | null;
}

interface Disk {
  freeBytes: number | null;
  totalBytes: number | null;
}

export interface BackupStatus {
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

export interface SystemOverview {
  checkedAt: string;
  problems: SystemProblem[];
  backup: { monitored: boolean; status: BackupStatus | null; error: string | null };
  serverDisk: Disk | null;
  jobs: {
    name: string;
    everyMs: number;
    lastOkAt: string | null;
    lastErrorAt: string | null;
    lastError: string | null;
    late: boolean;
  }[];
  channels: {
    email: { on: true; from: string; server: string } | null;
    sms: { on: true } | null;
    webhook: { on: true } | null;
    problems: { channel: "email" | "sms" | "webhook"; message: string }[];
  };
  escalation: { afterMinutes: number[]; repeatMinutes: number };
  heartbeat: { configured: boolean; last: { at: string; ok: boolean; error: string | null } | null };
  undelivered: {
    id: string;
    channel: string;
    to: string | null;
    title: string;
    attempts: number;
    lastError: string | null;
    createdAt: string;
    gaveUpAt: string | null;
  }[];
}

export type TestOutcome = { to: string | null; ok: boolean; error?: string } | null;
export interface TestAlertResult {
  email: TestOutcome;
  sms: TestOutcome;
  webhook: TestOutcome;
}

export async function getSystem(): Promise<SystemOverview> {
  const { data } = await api.get<SystemOverview>("/admin/system");
  return data;
}

export async function sendTestAlert(): Promise<TestAlertResult> {
  const { data } = await api.post<TestAlertResult>("/admin/system/test-alert");
  return data;
}
