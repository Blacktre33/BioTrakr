import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { User } from '@prisma/client';

import type { AuthenticatedUser, TokenPair } from '@biotrakr/types';
import { loadSecurityConfig } from '@biotrakr/config';
import {
  createAccessToken,
  createRefreshToken,
  hashPassword,
  verifyPassword,
  verifyRefreshToken,
} from '@biotrakr/utils';

import { PrismaService } from '../database/prisma.service';
import { passwordProblem } from './password-policy';
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
    /** Signed in with a one-time password: must choose their own now. */
    passwordChangeRequired: boolean;
  };
}

const INVALID_CREDENTIALS = 'Invalid email or password';
const INVALID_REFRESH = 'Invalid refresh token';

/**
 * Two requests (e.g. a duplicated browser tab) may refresh with the same
 * token at once. Within this window the late one is refused, but the sign-in
 * is not treated as stolen.
 */
export const REUSE_GRACE_MS = 30_000;

/**
 * However often it is refreshed, a sign-in ends this long after the
 * password was entered. Without a cap, a stolen refresh token used before
 * the owner's tab ever refreshes again would work indefinitely.
 */
export const MAX_SIGN_IN_DAYS = 30;

@Injectable()
export class AuthService {
  /** Compared against when the email is unknown, so timing doesn't reveal which accounts exist. */
  private readonly dummyHash = hashPassword(randomUUID());

  constructor(private readonly prisma: PrismaService) {}

  async login(
    email: string,
    password: string,
    userAgent?: string,
  ): Promise<LoginResult> {
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

    // Housekeeping: drop this user's expired sessions.
    await this.prisma.authSession.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date() } },
    });
    const familyId = randomUUID();
    return {
      ...(await this.issueTokens(
        user,
        familyId,
        familyId,
        new Date(),
        userAgent,
      )),
      user: this.publicProfile(user),
    };
  }

  /**
   * Exchanges a refresh token for a new pair. Each refresh token works once:
   * it is replaced by a new one, and presenting a replaced token again
   * (someone copied it) ends that whole sign-in.
   */
  async refresh(
    refreshToken: string,
    userAgent?: string,
  ): Promise<LoginResult> {
    let claims: { sub: string; jti?: string };
    try {
      claims = verifyRefreshToken(refreshToken) as {
        sub: string;
        jti?: string;
      };
    } catch {
      throw new UnauthorizedException(INVALID_REFRESH);
    }
    // Tokens issued before sessions existed have no id: sign in again.
    if (!claims.jti) throw new UnauthorizedException(INVALID_REFRESH);

    const session = await this.prisma.authSession.findUnique({
      where: { id: claims.jti },
    });
    if (
      !session ||
      session.userId !== claims.sub ||
      session.expiresAt < new Date()
    ) {
      throw new UnauthorizedException(INVALID_REFRESH);
    }
    if (session.revokedAt) {
      const recentRotation =
        session.revokedReason === 'rotated' &&
        Date.now() - session.revokedAt.getTime() < REUSE_GRACE_MS;
      if (session.revokedReason === 'rotated' && !recentRotation) {
        await this.revokeFamily(session.familyId, 'reuse_detected');
      }
      throw new UnauthorizedException(INVALID_REFRESH);
    }

    // A password lockout guards against guessing; it deliberately does not end
    // sessions that are already signed in (otherwise anyone could log a user
    // out by mistyping their password). Deactivated accounts are refused.
    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
    });
    if (!user || !user.isActive || !normalizeRole(user.role)) {
      await this.revokeFamily(session.familyId, 'logout');
      throw new UnauthorizedException(INVALID_REFRESH);
    }

    // Claim the old token first, conditionally: of two simultaneous
    // refreshes with the same token only one gets a new pair.
    const nextId = randomUUID();
    const { count } = await this.prisma.authSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: {
        revokedAt: new Date(),
        revokedReason: 'rotated',
        replacedById: nextId,
      },
    });
    if (count === 0) throw new UnauthorizedException(INVALID_REFRESH);

    return {
      ...(await this.issueTokens(
        user,
        nextId,
        session.familyId,
        session.signedInAt,
        userAgent,
      )),
      user: this.publicProfile(user),
    };
  }

  /** Ends the sign-in this refresh token belongs to. Unknown tokens are ignored. */
  async logout(refreshToken: string): Promise<void> {
    try {
      const { jti } = verifyRefreshToken(refreshToken);
      if (!jti) return;
      const session = await this.prisma.authSession.findUnique({
        where: { id: jti },
      });
      if (session) await this.revokeFamily(session.familyId, 'logout');
    } catch {
      // Expired or invalid: nothing to end.
    }
  }

  /** Signs the user out on every device (e.g. after a lost phone). */
  async logoutEverywhere(userId: string): Promise<number> {
    const { count } = await this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'logout_all' },
    });
    return count;
  }

  private async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
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

  private async issueTokens(
    user: User,
    sessionId: string,
    familyId: string,
    signedInAt: Date,
    userAgent?: string,
  ): Promise<TokenPair> {
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
    const security = loadSecurityConfig();
    await this.prisma.authSession.create({
      data: {
        id: sessionId,
        familyId,
        userId: user.id,
        signedInAt,
        expiresAt: new Date(
          Math.min(
            Date.now() + security.refreshTokenTtlSeconds * 1000,
            signedInAt.getTime() + MAX_SIGN_IN_DAYS * 24 * 60 * 60 * 1000,
          ),
        ),
        userAgent: userAgent?.slice(0, 255) ?? null,
      },
    });
    return {
      accessToken: createAccessToken(claims),
      refreshToken: createRefreshToken(claims, { jwtid: sessionId }),
      expiresInSeconds: security.accessTokenTtlSeconds,
    };
  }

  private publicProfile(user: User): LoginResult['user'] {
    return {
      id: user.id,
      organizationId: user.organizationId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: normalizeRole(user.role)!,
      passwordChangeRequired: user.passwordChangeRequired,
    };
  }

  /**
   * The signed-in person sets a new password. Every sign-in (including this
   * one) ends, so a password someone else knew stops working everywhere.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash || !user.isActive) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new BadRequestException({
        message: 'Your current password is not right',
        fields: ['currentPassword'],
      });
    }
    const problem = passwordProblem(newPassword, user.email);
    if (problem) {
      throw new BadRequestException({
        message: problem,
        fields: ['newPassword'],
      });
    }
    if (await verifyPassword(newPassword, user.passwordHash)) {
      throw new BadRequestException({
        message: 'Choose a password different from the current one',
        fields: ['newPassword'],
      });
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: await hashPassword(newPassword),
          passwordChangeRequired: false,
        },
      }),
      this.prisma.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'password_changed' },
      }),
    ]);
  }
}
