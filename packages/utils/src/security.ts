import bcrypt from "bcrypt";
import jwt, {
  type JwtPayload,
  type SignOptions,
  type VerifyOptions,
} from "jsonwebtoken";

import { loadSecurityConfig } from "@medasset/config";
import type {
  AuthenticatedUser,
  Permission,
  TokenPair,
  UserRole,
} from "@medasset/types";

/**
 * Claims embedded within access tokens. Storing organisation and role data
 * allows the API gateway to perform quick authorisation decisions without
 * fetching user records on every request.
 */
export interface AccessTokenClaims extends JwtPayload {
  sub: string;
  org: string;
  role: UserRole;
  permissions: Permission[];
  email: string;
  firstName: string;
  lastName: string;
  iat?: number;
}

/**
 * The refresh token only tracks the subject and issued timestamp. Extra
 * metadata should be persisted in the session store rather than the token.
 */
export interface RefreshTokenClaims extends JwtPayload {
  sub: string;
  type: "refresh";
}

function resolveSaltRounds(explicit?: number): number {
  if (explicit && explicit > 0) {
    return explicit;
  }

  return loadSecurityConfig().passwordSaltRounds;
}

/**
 * Hashes a plain-text password using bcrypt. The salt rounds default to the
 * shared security configuration so API and future auth services stay aligned.
 */
export async function hashPassword(
  password: string,
  saltRounds?: number,
): Promise<string> {
  const rounds = resolveSaltRounds(saltRounds);
  return bcrypt.hash(password, rounds);
}

/**
 * Verifies a password against a stored hash.
 */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function buildAccessTokenClaims(user: AuthenticatedUser): AccessTokenClaims {
  return {
    sub: user.id,
    org: user.organizationId,
    role: user.role,
    permissions: user.permissions,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    iat: user.sessionIssuedAt,
  };
}

/**
 * Signs a JWT access token for an authenticated user.
 */
export function createAccessToken(
  user: AuthenticatedUser,
  options: Partial<SignOptions> = {},
): string {
  const security = loadSecurityConfig();
  const claims = buildAccessTokenClaims(user);

  const issuer = options.issuer ?? security.jwtIssuer ?? undefined;
  const audience = options.audience ?? security.jwtAudience ?? undefined;

  const signOptions: SignOptions = {
    algorithm: "HS256",
    expiresIn: options.expiresIn ?? security.accessTokenTtlSeconds,
    ...(issuer !== undefined ? { issuer } : {}),
    ...(audience !== undefined ? { audience } : {}),
  };

  return jwt.sign(claims, security.jwtSecret, signOptions);
}

/**
 * Generates a refresh token, ensuring we tag the payload with an explicit
 * `type` claim so it can be distinguished from access tokens when decoded.
 */
export function createRefreshToken(
  user: AuthenticatedUser,
  options: Partial<SignOptions> = {},
): string {
  const security = loadSecurityConfig();

  const claims: RefreshTokenClaims = {
    sub: user.id,
    type: "refresh",
  };

  const issuer = options.issuer ?? security.jwtIssuer ?? undefined;
  const audience = options.audience ?? security.jwtAudience ?? undefined;

  const signOptions: SignOptions = {
    algorithm: "HS256",
    expiresIn: options.expiresIn ?? security.refreshTokenTtlSeconds,
    ...(issuer !== undefined ? { issuer } : {}),
    ...(audience !== undefined ? { audience } : {}),
  };

  return jwt.sign(claims, security.jwtSecret, signOptions);
}

/**
 * Helper that creates both access and refresh tokens in one go so callers
 * remain consistent in how they communicate expiry windows.
 */
export function createTokenPair(user: AuthenticatedUser): TokenPair {
  const security = loadSecurityConfig();
  const accessToken = createAccessToken(user);
  const refreshToken = createRefreshToken(user);

  return {
    accessToken,
    refreshToken,
    expiresInSeconds: security.accessTokenTtlSeconds,
  };
}

export interface VerifyAccessTokenOptions
  extends Omit<VerifyOptions, "algorithms"> {}

/**
 * Validates a bearer token and returns the embedded access claims.
 */
export function verifyAccessToken(
  token: string,
  options: VerifyAccessTokenOptions = {},
): AccessTokenClaims {
  const security = loadSecurityConfig();
  const payload = jwt.verify(token, security.jwtSecret, {
    algorithms: ["HS256"],
    issuer: security.jwtIssuer ?? undefined,
    audience: security.jwtAudience ?? undefined,
    ...options,
  });

  if (typeof payload === "string") {
    throw new Error("Invalid JWT payload format.");
  }

  return payload as AccessTokenClaims;
}

/**
 * Validates a refresh token and ensures the `type` guard is present.
 */
export function verifyRefreshToken(
  token: string,
  options: VerifyAccessTokenOptions = {},
): RefreshTokenClaims {
  const security = loadSecurityConfig();
  const payload = jwt.verify(token, security.jwtSecret, {
    algorithms: ["HS256"],
    issuer: security.jwtIssuer ?? undefined,
    audience: security.jwtAudience ?? undefined,
    ...options,
  });

  if (typeof payload === "string") {
    throw new Error("Invalid refresh token payload.");
  }

  const claims = payload as RefreshTokenClaims;

  if (claims.type !== "refresh") {
    throw new Error("Invalid refresh token payload.");
  }

  return claims;
}

/**
 * Extracts the bearer token from an HTTP `Authorization` header. The function
 * throws when the header is malformed so that upstream guards can respond with
 * a 401 without needing to repeat validation logic everywhere.
 */
export function getBearerToken(header: string | null | undefined): string {
  if (!header) {
    throw new Error("Missing Authorization header.");
  }

  const [scheme, value] = header.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !value) {
    throw new Error("Authorization header must use the Bearer scheme.");
  }

  return value;
}
