import { createHmac } from 'crypto';
import { createTransport, type Transporter } from 'nodemailer';

/**
 * Ways an urgent notice leaves the app: email through the hospital's mail
 * server, SMS through any HTTP SMS gateway, and the signed webhook. Settings
 * are read when used, so tests and restarts pick up changes.
 */

const TIMEOUT_MS = 10_000;

/** error is set whenever ok is false. */
export type SendResult = { ok: boolean; error?: string; permanent?: boolean };

export type Channel = 'email' | 'sms' | 'webhook';

export interface EmailConfig {
  host: string;
  port: number;
  /** TLS from the start (port 465). Otherwise STARTTLS when the server offers it. */
  secure: boolean;
  user: string | null;
  password: string | null;
  from: string;
}

export function emailConfig(): EmailConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.NOTIFY_EMAIL_FROM?.trim();
  if (!host || !from) return null;
  const port = Number(process.env.SMTP_PORT) || 587;
  return {
    host,
    port,
    secure:
      (process.env.SMTP_SECURE ?? '').trim().toLowerCase() === 'true' ||
      port === 465,
    user: process.env.SMTP_USER?.trim() || null,
    password: process.env.SMTP_PASSWORD || null,
    from,
  };
}

export interface SmsConfig {
  /** Gateway address; {to} and {text} are filled in (URL-encoded). */
  url: string;
  method: 'GET' | 'POST';
  /** POST body template; JSON if it starts with "{", otherwise a form. */
  body: string | null;
  headers: Record<string, string>;
  /** The message, e.g. "BioTrakr: {title} {link}" (match the DLT template). */
  text: string;
  /** If set, the gateway's answer must contain this, or it counts as failed. */
  successMatch: string | null;
}

export const DEFAULT_SMS_TEXT = 'BioTrakr: {title} {link}';

function parseHeaders(raw: string | undefined): Record<string, string> | null {
  if (!raw?.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      Object.values(parsed).some((v) => typeof v !== 'string')
    ) {
      return null;
    }
    return parsed as Record<string, string>;
  } catch {
    return null;
  }
}

/** Null when SMS is off, or its settings cannot work (see channelProblems). */
export function smsConfig(): SmsConfig | null {
  const url = process.env.NOTIFY_SMS_URL?.trim();
  if (!url || smsProblem()) return null;
  return {
    url,
    method:
      (process.env.NOTIFY_SMS_METHOD ?? 'GET').trim().toUpperCase() === 'POST'
        ? 'POST'
        : 'GET',
    body: process.env.NOTIFY_SMS_BODY?.trim() || null,
    headers: parseHeaders(process.env.NOTIFY_SMS_HEADERS) ?? {},
    text: process.env.NOTIFY_SMS_TEXT?.trim() || DEFAULT_SMS_TEXT,
    successMatch: process.env.NOTIFY_SMS_SUCCESS_MATCH?.trim() || null,
  };
}

/** Why the SMS settings cannot work, or null. */
function smsProblem(): string | null {
  const url = process.env.NOTIFY_SMS_URL?.trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) {
    return 'NOTIFY_SMS_URL must start with http:// or https://';
  }
  const body = process.env.NOTIFY_SMS_BODY ?? '';
  if (!/\{to(_digits)?\}/.test(url + body)) {
    return 'NOTIFY_SMS_URL (or NOTIFY_SMS_BODY) has no {to} for the phone number';
  }
  if (!/\{text\}/.test(url + body)) {
    return 'NOTIFY_SMS_URL (or NOTIFY_SMS_BODY) has no {text} for the message';
  }
  if (parseHeaders(process.env.NOTIFY_SMS_HEADERS) === null) {
    return 'NOTIFY_SMS_HEADERS must be a JSON object of text values, e.g. {"authkey":"…"}';
  }
  return null;
}

/**
 * Settings that were filled in but cannot work, so nothing is sent where
 * an administrator expects it to be. Shown on Settings → System and sent
 * to administrators by the system checks.
 */
export function channelProblems(): { channel: Channel; message: string }[] {
  const problems: { channel: Channel; message: string }[] = [];
  const url = process.env.NOTIFY_WEBHOOK_URL?.trim();
  const secret = process.env.NOTIFY_WEBHOOK_SECRET?.trim() ?? '';
  if (url && secret.length < 16) {
    problems.push({
      channel: 'webhook',
      message:
        'The webhook is off: NOTIFY_WEBHOOK_SECRET must be at least 16 characters',
    });
  }
  const sms = smsProblem();
  if (sms) problems.push({ channel: 'sms', message: `SMS is off: ${sms}` });
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.NOTIFY_EMAIL_FROM?.trim();
  if (host && !from) {
    problems.push({
      channel: 'email',
      message: 'Email is off: set NOTIFY_EMAIL_FROM (the sender address)',
    });
  }
  if (!host && from) {
    problems.push({
      channel: 'email',
      message: 'Email is off: set SMTP_HOST (the mail server)',
    });
  }
  return problems;
}

/** "+919876543210" for {to}; "919876543210" for {to_digits}. */
function fill(
  template: string,
  values: { to: string; text: string },
  encode: (v: string) => string,
): string {
  return template
    .replace(/\{to_digits\}/g, encode(values.to.replace(/\D/g, '')))
    .replace(/\{to\}/g, encode(values.to))
    .replace(/\{text\}/g, encode(values.text));
}

/** The HTTP request an SMS becomes. Exported for tests. */
export function smsRequest(
  config: SmsConfig,
  to: string,
  text: string,
): { url: string; init: RequestInit } {
  const values = { to, text };
  const url = fill(config.url, values, encodeURIComponent);
  const headers: Record<string, string> = {
    'User-Agent': 'BioTrakr-Notifications',
    ...config.headers,
  };
  let body: string | undefined;
  if (config.method === 'POST' && config.body) {
    const json = config.body.startsWith('{');
    body = fill(config.body, values, (v) =>
      json ? JSON.stringify(v).slice(1, -1) : encodeURIComponent(v),
    );
    if (!Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = json
        ? 'application/json'
        : 'application/x-www-form-urlencoded';
    }
  }
  return {
    url,
    init: {
      method: config.method,
      headers,
      body,
      // A redirect could carry the message elsewhere: not followed.
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  };
}

/** The SMS text: the configured template with the notice filled in. */
export function smsText(
  template: string,
  notice: { title: string; link: string | null },
): string {
  return template
    .replace(/\{title\}/g, notice.title)
    .replace(/\{link\}/g, notice.link ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Retrying will not help: the gateway refused the request itself. */
export const permanentStatus = (status: number) =>
  (status >= 300 && status < 400) ||
  (status >= 400 && status < 500 && status !== 408 && status !== 429);

const networkError = (e: unknown): SendResult => ({
  ok: false,
  permanent: false,
  error:
    (e as Error).name === 'TimeoutError'
      ? `No answer within ${TIMEOUT_MS / 1000} s`
      : (e as Error).message,
});

export async function sendSms(
  config: SmsConfig,
  to: string,
  text: string,
): Promise<SendResult> {
  const { url, init } = smsRequest(config, to, text);
  try {
    const res = await fetch(url, init);
    let answer = '';
    if (config.successMatch) answer = await res.text().catch(() => '');
    // Free the connection; the answer's content is not needed.
    else await res.body?.cancel().catch(() => undefined);
    if (!res.ok) {
      return {
        ok: false,
        error: `HTTP ${res.status}`,
        permanent: permanentStatus(res.status),
      };
    }
    if (config.successMatch && !answer.includes(config.successMatch)) {
      // Many gateways answer 200 with an error inside: worth a retry.
      return {
        ok: false,
        error: `Gateway answered: ${answer.replace(/\s+/g, ' ').slice(0, 200)}`,
      };
    }
    return { ok: true };
  } catch (e) {
    return networkError(e);
  }
}

let transport: { key: string; transporter: Transporter } | null = null;

function transporterFor(config: EmailConfig): Transporter {
  const key = JSON.stringify(config);
  if (transport?.key !== key) {
    transport?.transporter.close();
    transport = {
      key,
      transporter: createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.user
          ? { user: config.user, pass: config.password ?? '' }
          : undefined,
        connectionTimeout: TIMEOUT_MS,
        greetingTimeout: TIMEOUT_MS,
        socketTimeout: TIMEOUT_MS,
      }),
    };
  }
  return transport.transporter;
}

export async function sendEmail(
  config: EmailConfig,
  message: { to: string; subject: string; text: string },
): Promise<SendResult> {
  try {
    await transporterFor(config).sendMail({
      from: config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    return { ok: true };
  } catch (e) {
    const err = e as Error & { responseCode?: number };
    // 5xx from the mail server: this address or message is refused for good.
    const refused =
      typeof err.responseCode === 'number' &&
      err.responseCode >= 500 &&
      err.responseCode < 600;
    return {
      ok: false,
      permanent: refused,
      error: err.responseCode
        ? `Mail server answered ${err.responseCode}: ${err.message}`.slice(
            0,
            300,
          )
        : err.message,
    };
  }
}

/** Header value a receiver recomputes to check a message really came from BioTrakr. */
export function signWebhook(secret: string, timestamp: number, body: string) {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

export async function sendWebhook(
  url: string,
  secret: string,
  deliveryId: string,
  payload: unknown,
  at: Date,
): Promise<SendResult> {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(at.getTime() / 1000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'BioTrakr-Notifications',
        'X-BioTrakr-Delivery': deliveryId,
        'X-BioTrakr-Timestamp': String(timestamp),
        'X-BioTrakr-Signature': signWebhook(secret, timestamp, body),
      },
      body,
      // A redirect could carry the message elsewhere: not followed.
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Free the connection; the answer's content is not used.
    await res.body?.cancel().catch(() => undefined);
    return res.ok
      ? { ok: true }
      : {
          ok: false,
          error: `HTTP ${res.status}`,
          permanent: permanentStatus(res.status),
        };
  } catch (e) {
    return networkError(e);
  }
}

/** Which ways out are switched on, for Settings → System. */
export function channelStatus() {
  const url = process.env.NOTIFY_WEBHOOK_URL?.trim();
  const secret = process.env.NOTIFY_WEBHOOK_SECRET?.trim() ?? '';
  const email = emailConfig();
  return {
    email: email ? { on: true, from: email.from, server: email.host } : null,
    sms: smsConfig() ? { on: true } : null,
    webhook: url && secret.length >= 16 ? { on: true } : null,
    problems: channelProblems(),
  };
}
