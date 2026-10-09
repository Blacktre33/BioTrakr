import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';
/** Accept a caller's id (e.g. from a load balancer) only if it looks like one. */
const SAFE_ID = /^[A-Za-z0-9._-]{8,128}$/;

export type RequestWithId = Request & { requestId?: string };

/**
 * Gives every request an id, echoed in the response and in error logs, so
 * a staff member's "it failed" can be matched to the exact log line.
 */
export function requestIdMiddleware(
  req: RequestWithId,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.header(REQUEST_ID_HEADER);
  const id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  req.requestId = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}
