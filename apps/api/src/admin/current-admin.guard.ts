import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import type { AuthUser } from '../auth/auth-user';
import { normalizeRole } from '../auth/roles';
import { PrismaService } from '../database/prisma.service';

/**
 * Admin actions check the database, not just the access token: an
 * administrator who was just demoted or deactivated (or whose password was
 * reset) still holds a token saying "admin" for up to 15 minutes, and must
 * not be able to use it to restore themselves or create accounts.
 */
@Injectable()
export class CurrentAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const caller = context.switchToHttp().getRequest().user as
      | AuthUser
      | undefined;
    const me = caller
      ? await this.prisma.user.findFirst({
          where: {
            id: caller.userId,
            organizationId: caller.organizationId,
            isActive: true,
          },
          select: { role: true, passwordChangeRequired: true },
        })
      : null;
    if (
      !me ||
      normalizeRole(me.role) !== 'admin' ||
      me.passwordChangeRequired
    ) {
      throw new ForbiddenException(
        'Your administrator access has changed. Sign in again.',
      );
    }
    return true;
  }
}
