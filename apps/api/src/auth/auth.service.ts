import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { User } from '@prisma/client';

import type { AuthenticatedUser, TokenPair } from '@biotrakr/types';
import {
  createTokenPair,
  hashPassword,
  verifyPassword,
  verifyRefreshToken,
} from '@biotrakr/utils';

import { PrismaService } from '../database/prisma.service';
import { normalizeRole } from './roles';

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;

export interface LoginResult extends TokenPair {
  user: {
    id: string;
    organizationId: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  };
}

const INVALID_CREDENTIALS = 'Invalid email or password';

@Injectable()
export class AuthService {
  /** Compared against when the email is unknown, so timing doesn't reveal which accounts exist. */
  private readonly dummyHash = hashPassword(randomUUID());

  constructor(private readonly prisma: PrismaService) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
    });

    if (!user || !user.passwordHash) {
      await verifyPassword(password, await this.dummyHash);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
      // Still compare, so a locked account responds like any other failure.
      await verifyPassword(password, user.passwordHash);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const passwordOk = await verifyPassword(password, user.passwordHash);
    if (!passwordOk) {
      await this.recordFailedLogin(user);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (!user.isActive || !normalizeRole(user.role)) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        accountLockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    return { ...this.issueTokens(user), user: this.publicProfile(user) };
  }

  async refresh(refreshToken: string): Promise<LoginResult> {
    let userId: string;
    try {
      userId = verifyRefreshToken(refreshToken).sub;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // A password lockout guards against guessing; it deliberately does not end
    // sessions that are already signed in (otherwise anyone could log a user
    // out by mistyping their password). Deactivated accounts are refused.
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive || !normalizeRole(user.role)) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return { ...this.issueTokens(user), user: this.publicProfile(user) };
  }

  /**
   * Atomic increment, so many parallel wrong guesses cannot all read the same
   * count and slip past the lockout.
   */
  private async recordFailedLogin(user: User): Promise<void> {
    const { failedLoginAttempts } = await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });
    if (failedLoginAttempts >= MAX_FAILED_LOGINS) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          accountLockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000),
        },
      });
    }
  }

  private issueTokens(user: User): TokenPair {
    const claims: AuthenticatedUser = {
      id: user.id,
      organizationId: user.organizationId,
      role: normalizeRole(user.role)!,
      permissions: [],
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      sessionIssuedAt: Math.floor(Date.now() / 1000),
    };
    return createTokenPair(claims);
  }

  private publicProfile(user: User): LoginResult['user'] {
    return {
      id: user.id,
      organizationId: user.organizationId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: normalizeRole(user.role)!,
    };
  }
}
