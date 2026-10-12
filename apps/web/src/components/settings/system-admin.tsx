"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, CircleSlash, Send, XCircle } from "lucide-react";

import { Badge, Button, Card, Skeleton } from "@/components/ui";
import type { SystemOverview, TestAlertResult } from "@/lib/api/system";
import { useSystem, useTestAlert } from "@/lib/hooks/use-system";
import { cn, formatRelativeTime } from "@/lib/utils";

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const size = (bytes: number) =>
  bytes >= 100 * GB
    ? `${Math.round(bytes / GB)} GB`
    : bytes >= GB
      ? `${(bytes / GB).toFixed(1)} GB`
      : `${Math.max(1, Math.round(bytes / MB))} MB`;
const when = (iso: string | null | undefined) => (iso ? formatRelativeTime(iso) : "never");
const exact = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : undefined);

function diskLine(disk: { freeBytes: number | null; totalBytes: number | null } | null | undefined) {
  if (!disk?.freeBytes || !disk.totalBytes) return null;
  return `${size(disk.freeBytes)} free of ${size(disk.totalBytes)}`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="shrink-0 text-gray-400 sm:w-44">{label}</dt>
      <dd className="min-w-0 break-words text-gray-100">{children}</dd>
    </div>
  );
}

// ------------------------------------------------------------- problems

function Problems({ data }: { data: SystemOverview }) {
  if (data.problems.length === 0) {
    return (
      <Card className="flex items-center gap-3 p-6">
        <CheckCircle2 className="h-6 w-6 shrink-0 text-success-500" aria-hidden="true" />
        <div>
          <p className="font-semibold text-gray-100">Everything is working</p>
          <p className="text-sm text-gray-400">Checked {when(data.checkedAt)}. Administrators are told here and outside the app if that changes.</p>
        </div>
      </Card>
    );
  }
  const sorted = [...data.problems].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
  return (
    <Card className="p-6">
      <h3 className="mb-4 font-semibold text-gray-100">Needs attention</h3>
      <ul className="space-y-4">
        {sorted.map((p) => (
          <li key={p.key} className="flex gap-3">
            <AlertTriangle
              className={cn("mt-0.5 h-5 w-5 shrink-0", p.severity === "critical" ? "text-critical-500" : "text-warning-500")}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="font-medium text-gray-100">
                <span className="sr-only">{p.severity === "critical" ? "Critical: " : "Warning: "}</span>
                {p.title}
              </p>
              {p.detail && <p className="mt-0.5 break-words text-sm text-gray-400">{p.detail}</p>}
              {p.since && (
                <p className="mt-0.5 text-xs text-gray-500" title={exact(p.since)}>
                  Since {when(p.since)}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ------------------------------------------------------------- alerts

const CHANNEL_LABEL = { email: "Email", sms: "SMS", webhook: "Webhook (your gateway)" } as const;

function Outcome({ name, result }: { name: keyof TestAlertResult; result: TestAlertResult[keyof TestAlertResult] }) {
  if (!result) return null;
  return (
    <li className="flex items-start gap-2 text-sm">
      {result.ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-500" aria-hidden="true" />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-critical-500" aria-hidden="true" />
      )}
      <span className="min-w-0 break-words text-gray-300">
        <strong className="text-gray-100">{CHANNEL_LABEL[name]}:</strong>{" "}
        {result.ok ? `sent${result.to ? ` to ${result.to}` : ""}` : `not sent. ${result.error ?? ""}`}
      </span>
    </li>
  );
}

function Alerts({ data }: { data: SystemOverview }) {
  const test = useTestAlert();
  const [result, setResult] = useState<TestAlertResult | null>(null);
  const { channels, escalation } = data;
  const anyOn = Boolean(channels.email || channels.sms || channels.webhook);
  const steps = escalation.afterMinutes.map((m) => `${m} min`).join(" and ");

  const runTest = async () => {
    setResult(null);
    try {
      setResult(await test.mutateAsync());
    } catch {
      // Shown below from test.error.
    }
  };

  return (
    <Card className="p-6">
      <h3 className="mb-1 font-semibold text-gray-100">Urgent alerts outside the app</h3>
      <p className="mb-4 text-sm text-gray-400">
        When a life-saving device is reported out of use, biomed hears at once. If nobody starts on it, engineers and
        administrators hear again after {steps}
        {escalation.repeatMinutes ? `, then every ${escalation.repeatMinutes} min until work starts` : ""}.
      </p>
      <dl className="space-y-2 text-sm">
        <Row label="Email">
          {channels.email ? (
            <>
              <Badge variant="success" size="sm">
                On
              </Badge>{" "}
              from {channels.email.from} through {channels.email.server}
            </>
          ) : (
            <Badge size="sm">Off</Badge>
          )}
        </Row>
        <Row label="SMS">
          {channels.sms ? (
            <Badge variant="success" size="sm">
              On
            </Badge>
          ) : (
            <Badge size="sm">Off</Badge>
          )}
        </Row>
        <Row label="Webhook (your gateway)">
          {channels.webhook ? (
            <Badge variant="success" size="sm">
              On
            </Badge>
          ) : (
            <Badge size="sm">Off</Badge>
          )}
        </Row>
      </dl>
      {!anyOn && (
        <p className="mt-4 rounded-xl border border-warning-500/30 bg-warning-500/10 p-3 text-sm text-gray-200">
          Nothing is set up, so urgent reports reach only people who have BioTrakr open. Ask whoever installed the
          server to set the email (SMTP_HOST, NOTIFY_EMAIL_FROM) or SMS (NOTIFY_SMS_URL) settings in deploy/.env, as the
          install guide describes.
        </p>
      )}
      {anyOn && (
        <div className="mt-6 border-t border-white/5 pt-4">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Send className="h-4 w-4" />}
            onClick={runTest}
            isLoading={test.isPending}
          >
            Send me a test alert
          </Button>
          <p className="mt-2 text-xs text-gray-500">
            Goes to your own email and mobile number through each channel that is on. An SMS may cost money.
          </p>
          <div aria-live="polite">
            {result && (
              <ul className="mt-3 space-y-1">
                <Outcome name="email" result={result.email} />
                <Outcome name="sms" result={result.sms} />
                <Outcome name="webhook" result={result.webhook} />
              </ul>
            )}
            {test.error && (
              <p role="alert" className="mt-3 text-sm text-critical-500">
                {test.error instanceof Error ? test.error.message : "Could not send the test."}
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------- backups

function Backups({ data }: { data: SystemOverview }) {
  const { backup } = data;
  const s = backup.status;
  return (
    <Card className="p-6">
      <h3 className="mb-4 font-semibold text-gray-100">Backups</h3>
      {!backup.monitored ? (
        <p className="text-sm text-gray-400">
          Not watched on this server: BACKUP_STATUS_FILE is not set. A hospital install (deploy/docker-compose.yml) sets
          it, and administrators are then told when a backup fails or is missed.
        </p>
      ) : !s ? (
        <p className="text-sm text-gray-300">{backup.error ?? "No report from the backup service yet."}</p>
      ) : (
        <dl className="space-y-2 text-sm">
          <Row label="Last good backup">
            <span title={exact(s.lastSuccessAt)}>{when(s.lastSuccessAt)}</span>
            {s.lastFile && s.lastSizeBytes != null && (
              <span className="text-gray-400">
                {" "}
                · {s.lastFile} ({size(s.lastSizeBytes)})
              </span>
            )}
          </Row>
          {s.lastError && (
            <Row label="Last attempt failed">
              <span className="text-critical-500">{s.lastError}</span>
            </Row>
          )}
          <Row label="Next backup">
            <span title={exact(s.nextRunAt)}>{s.nextRunAt ? exact(s.nextRunAt) : "not scheduled"}</span>
          </Row>
          <Row label="Kept for">{s.keepDays} days</Row>
          <Row label="Backup disk">{diskLine(s.disk) ?? "unknown"}</Row>
          <Row label="Copy off this server">
            {!s.copy.configured ? (
              <span className="text-warning-500">Not set up: backups are only on this server</span>
            ) : s.copy.lastError ? (
              <span className="text-critical-500">{s.copy.lastError}</span>
            ) : (
              <span title={exact(s.copy.lastSuccessAt)}>last copied {when(s.copy.lastSuccessAt)}</span>
            )}
          </Row>
          {s.copy.configured && <Row label="Second location disk">{diskLine(s.copy.disk) ?? "unknown"}</Row>}
          {data.serverDisk && <Row label="Server disk (database)">{diskLine(data.serverDisk) ?? "unknown"}</Row>}
        </dl>
      )}
    </Card>
  );
}

// ------------------------------------------------------------- jobs & monitor

function Jobs({ data }: { data: SystemOverview }) {
  const { heartbeat } = data;
  return (
    <Card className="p-6">
      <h3 className="mb-4 font-semibold text-gray-100">Background jobs</h3>
      {data.jobs.length === 0 ? (
        <p className="text-sm text-gray-400">No background jobs run in this API process (they are switched off).</p>
      ) : (
        <ul className="space-y-3 text-sm">
          {data.jobs.map((j) => (
            <li key={j.name} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-gray-100">{j.name}</span>
              <span className="flex items-center gap-2 text-gray-400">
                <span title={exact(j.lastOkAt)}>{j.lastOkAt ? `worked ${when(j.lastOkAt)}` : "not run yet"}</span>
                {j.late ? (
                  <Badge variant="critical" size="sm">
                    Not working
                  </Badge>
                ) : j.lastError && j.lastErrorAt && (!j.lastOkAt || j.lastErrorAt > j.lastOkAt) ? (
                  <Badge variant="warning" size="sm">
                    Last run failed
                  </Badge>
                ) : null}
              </span>
              {j.lastError && (j.late || (j.lastErrorAt && (!j.lastOkAt || j.lastErrorAt > j.lastOkAt))) && (
                <span className="w-full break-words text-xs text-gray-500">{j.lastError}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6 border-t border-white/5 pt-4 text-sm">
        <p className="font-medium text-gray-100">Outside monitor</p>
        {heartbeat.configured ? (
          <p className="mt-1 text-gray-400">
            {heartbeat.last
              ? heartbeat.last.ok
                ? `Last told it this server is up ${when(heartbeat.last.at)}.`
                : `Could not reach it ${when(heartbeat.last.at)}: ${heartbeat.last.error}`
              : "Set up; the first call is due within five minutes."}
          </p>
        ) : (
          <p className="mt-1 text-gray-400">
            <CircleSlash className="mr-1 inline h-4 w-4 align-text-bottom" aria-hidden="true" />
            Not set up. Nothing on this server can warn anyone if the server itself stops: set HEARTBEAT_URL to a
            monitor elsewhere (for example Uptime Kuma on another machine) that alerts you when the calls stop.
          </p>
        )}
      </div>
    </Card>
  );
}

function Undelivered({ data }: { data: SystemOverview }) {
  if (data.undelivered.length === 0) return null;
  return (
    <Card className="p-6">
      <h3 className="mb-1 font-semibold text-gray-100">Messages not delivered (last 7 days)</h3>
      <p className="mb-4 text-sm text-gray-400">Still being retried, or given up on after the last try.</p>
      <ul className="space-y-3 text-sm">
        {data.undelivered.map((m) => (
          <li key={m.id} className="border-b border-white/5 pb-3 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge size="sm">{CHANNEL_LABEL[m.channel as keyof typeof CHANNEL_LABEL] ?? m.channel}</Badge>
              {m.to && <span className="text-gray-300">{m.to}</span>}
              <span className="text-gray-500" title={exact(m.createdAt)}>
                {when(m.createdAt)}
              </span>
              {m.gaveUpAt ? (
                <Badge variant="critical" size="sm">
                  Gave up after {m.attempts} tries
                </Badge>
              ) : (
                <Badge variant="warning" size="sm">
                  Retrying ({m.attempts} so far)
                </Badge>
              )}
            </div>
            <p className="mt-1 break-words text-gray-300">{m.title}</p>
            {m.lastError && <p className="mt-0.5 break-words text-xs text-gray-500">{m.lastError}</p>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function SystemAdmin() {
  const { data, isLoading, error } = useSystem();
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <Card className="p-6">
        <p role="alert" className="text-sm text-critical-500">
          Could not load the system status: {error instanceof Error ? error.message : "please try again"}
        </p>
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      <Problems data={data} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Alerts data={data} />
        <Backups data={data} />
        <Jobs data={data} />
        <Undelivered data={data} />
      </div>
    </div>
  );
}
