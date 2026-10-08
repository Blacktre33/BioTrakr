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

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const locked =
      user?.accountLockedUntil && user.accountLockedUntil > new Date();
    if (!user || !user.isActive || locked || !normalizeRole(user.role)) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return { ...this.issueTokens(user), user: this.publicProfile(user) };
  }

  private async recordFailedLogin(user: User): Promise<void> {
    const attempts = user.failedLoginAttempts + 1;
    const lock = attempts >= MAX_FAILED_LOGINS;
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: lock ? 0 : attempts,
        accountLockedUntil: lock
          ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
          : undefined,
      },
    });
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
