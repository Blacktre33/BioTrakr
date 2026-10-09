import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';

import type { AuthUser } from './auth-user';
import type { Role } from './roles';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const ROLES_KEY = 'auth:roles';
export const ALLOW_PENDING_PASSWORD_KEY = 'auth:allowPendingPassword';

/** Skips authentication for a route (e.g. health checks, login). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Lets a sign-in that still uses a one-time password reach this route
 * (changing the password, signing out). Every other route refuses it.
 */
export const AllowPendingPasswordChange = () =>
  SetMetadata(ALLOW_PENDING_PASSWORD_KEY, true);

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
