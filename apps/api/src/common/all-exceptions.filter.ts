import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

import { randomUUID } from 'crypto';

import { REQUEST_ID_HEADER, type RequestWithId } from './request-id';

/** Database errors that are the caller's to fix, with a safe message. */
const PRISMA_ERRORS: Record<string, { status: number; message: string }> = {
  P2002: { status: HttpStatus.CONFLICT, message: 'This already exists' },
  P2003: {
    status: HttpStatus.BAD_REQUEST,
    message: 'A referenced record does not exist',
  },
  P2025: { status: HttpStatus.NOT_FOUND, message: 'Not found' },
  // Serialization failure or deadlock: safe to try again.
  P2034: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: 'The system is busy. Please try again.',
  },
};

/**
 * Last line of defence for errors no handler dealt with:
 * - HTTP errors pass through unchanged.
 * - Known database errors become the right 4xx/503 instead of a 500.
 * - Anything else is a 500 that never echoes internals (SQL, stack traces),
 *   but carries the request id so support can find the log entry.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<RequestWithId>();
    // Errors raised before the request-id middleware (e.g. by the body
    // parser) still get an id.
    const requestId = req.requestId ?? randomUUID();
    if (!res.headersSent) res.setHeader(REQUEST_ID_HEADER, requestId);

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      res
        .status(exception.getStatus())
        .json(
          typeof body === 'string'
            ? { statusCode: exception.getStatus(), message: body }
            : body,
        );
      return;
    }

    // Errors from Express middleware (body parser, etc.) that are about the
    // request itself: malformed JSON (400), body too large (413).
    const status = (exception as { status?: unknown }).status;
    if (
      typeof status === 'number' &&
      status >= 400 &&
      status < 500 &&
      (exception as { expose?: boolean }).expose
    ) {
      res.status(status).json({
        statusCode: status,
        message:
          status === 413
            ? 'The request is too large'
            : status === 400
              ? 'The request body is not valid JSON'
              : (exception as Error).message,
        requestId,
      });
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const known = PRISMA_ERRORS[exception.code];
      if (known) {
        this.logger.warn(
          `${req.method} ${req.originalUrl} -> ${known.status} (${exception.code}) [${requestId}]`,
        );
        res.status(known.status).json({
          statusCode: known.status,
          message: known.message,
          requestId,
        });
        return;
      }
    }

    this.logger.error(
      `${req.method} ${req.originalUrl} failed [${requestId}]`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: `Something went wrong on our side. If it keeps happening, quote reference ${requestId}.`,
      requestId,
    });
  }
}
