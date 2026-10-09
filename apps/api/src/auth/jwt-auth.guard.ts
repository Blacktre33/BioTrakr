import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { getBearerToken, verifyAccessToken } from '@biotrakr/utils';

import type { AuthUser } from './auth-user';
import { ALLOW_PENDING_PASSWORD_KEY, IS_PUBLIC_KEY } from './decorators';
import { normalizeRole } from './roles';

/**
 * Global guard: every route requires a valid access token unless marked
 * @Public(). The verified claims are attached to `request.user`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    let claims: ReturnType<typeof verifyAccessToken>;
    try {
      claims = verifyAccessToken(
        getBearerToken(request.headers?.authorization),
      );
    } catch {
      // Same message for missing, malformed, expired or forged tokens.
      throw new UnauthorizedException('Authentication required');
    }

    const role = normalizeRole(claims.role);
    if (!claims.sub || !claims.org || !role) {
      throw new UnauthorizedException('Authentication required');
    }

    // A one-time password was used: only changing it is allowed until then.
    if (
      claims.pwc &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Choose your own password before continuing',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }

    const user: AuthUser = {
      userId: claims.sub,
      organizationId: claims.org,
      role,
      email: claims.email,
    };
    request.user = user;
    return true;
  }
}
