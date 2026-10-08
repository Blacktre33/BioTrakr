import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';

import type { AuthUser } from './auth-user';
import type { Role } from './roles';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const ROLES_KEY = 'auth:roles';

/** Skips authentication for a route (e.g. health checks, login). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Restricts a controller or route to the given roles. A route-level
 * decorator replaces the controller-level one.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Injects the authenticated user that JwtAuthGuard attached to the request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser =>
    context.switchToHttp().getRequest().user,
);
