import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthUser } from './auth-user';
import { IS_PUBLIC_KEY, ROLES_KEY } from './decorators';
import type { Role } from './roles';

/**
 * Global guard (runs after JwtAuthGuard). Routes without @Roles are open to
 * any authenticated *staff* user; machine accounts ("integration") may only
 * reach routes that list them explicitly.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const user: AuthUser | undefined = context.switchToHttp().getRequest().user;
    if (!user) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      targets,
    );
    const allowed = required?.length
      ? required.includes(user.role)
      : user.role !== 'integration';

    if (!allowed) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
