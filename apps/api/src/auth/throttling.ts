import type { ExecutionContext } from '@nestjs/common';
import type { ThrottlerOptions } from '@nestjs/throttler';

import { getBearerToken, verifyAccessToken } from '@biotrakr/utils';

type Req = {
  ip?: string;
  headers?: Record<string, string | undefined>;
  body?: { email?: unknown };
};

const CREDENTIAL_PATHS = ['/auth/login', '/auth/refresh'];

function clientIp(req: Req): string {
  // With TRUST_PROXY set, Express derives req.ip from X-Forwarded-For.
  return req.ip ?? 'unknown';
}

/**
 * Signed-in callers are limited per user, so staff sharing one hospital
 * outbound IP do not share a budget. Everyone else is limited per IP.
 */
function userOrIp(req: Req): string {
  try {
    const claims = verifyAccessToken(
      getBearerToken(req.headers?.authorization),
    );
    if (claims.sub) return `user:${claims.sub}`;
  } catch {
    // not signed in, or invalid token: fall back to IP
  }
  return `ip:${clientIp(req)}`;
}

function isCredentialRoute(context: ExecutionContext): boolean {
  const url: string = context.switchToHttp().getRequest().originalUrl ?? '';
  const path = url.split('?')[0];
  return CREDENTIAL_PATHS.some((p) => path.endsWith(p));
}

export const THROTTLERS: ThrottlerOptions[] = [
  // Everything: 300 requests a minute per user (or per IP when anonymous).
  { name: 'default', ttl: 60_000, limit: 300, getTracker: userOrIp },
  // Login/refresh: 5 a minute per IP and email, so one person mistyping
  // cannot lock everyone behind the same IP out of signing in...
  {
    name: 'credentials',
    ttl: 60_000,
    limit: 5,
    skipIf: (context) => !isCredentialRoute(context),
    getTracker: (req: Req) => {
      const email =
        typeof req.body?.email === 'string'
          ? req.body.email.trim().toLowerCase()
          : '';
      return `cred:${clientIp(req)}:${email}`;
    },
  },
  // ...and 30 a minute per IP overall, to cap password spraying across accounts.
  {
    name: 'credentialsPerIp',
    ttl: 60_000,
    limit: 30,
    skipIf: (context) => !isCredentialRoute(context),
    getTracker: (req: Req) => `cred-ip:${clientIp(req)}`,
  },
];
