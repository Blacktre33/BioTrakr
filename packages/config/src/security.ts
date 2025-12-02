import { z } from "zod";

const SecurityConfigSchema = z
  .object({
    JWT_SECRET: z
      .string()
      .min(32, "JWT_SECRET must be at least 32 characters."),
    JWT_ISSUER: z.string().optional(),
    JWT_AUDIENCE: z.string().optional(),
    JWT_ACCESS_TOKEN_TTL: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60),
    JWT_REFRESH_TOKEN_TTL: z.coerce
      .number()
      .int()
      .positive()
      .default(7 * 24 * 60 * 60),
    PASSWORD_SALT_ROUNDS: z.coerce
      .number()
      .int()
      .min(10, "PASSWORD_SALT_ROUNDS should be at least 10 for bcrypt.")
      .default(12),
    CSRF_COOKIE_NAME: z.string().default("biotrakr.csrf"),
    CSRF_HEADER_NAME: z.string().default("x-biotrakr-csrf-token"),
  })
  .transform((value) => {
    return {
      jwtSecret: value.JWT_SECRET,
      jwtIssuer: value.JWT_ISSUER ?? null,
      jwtAudience: value.JWT_AUDIENCE ?? null,
      accessTokenTtlSeconds: value.JWT_ACCESS_TOKEN_TTL,
      refreshTokenTtlSeconds: value.JWT_REFRESH_TOKEN_TTL,
      passwordSaltRounds: value.PASSWORD_SALT_ROUNDS,
      csrfCookieName: value.CSRF_COOKIE_NAME,
      csrfHeaderName: value.CSRF_HEADER_NAME,
    } satisfies SecurityConfig;
  });

export interface SecurityConfig {
  readonly jwtSecret: string;
  readonly jwtIssuer: string | null;
  readonly jwtAudience: string | null;
  readonly accessTokenTtlSeconds: number;
  readonly refreshTokenTtlSeconds: number;
  readonly passwordSaltRounds: number;
  readonly csrfCookieName: string;
  readonly csrfHeaderName: string;
}

let cachedConfig: SecurityConfig | undefined;

/**
 * Centralised security defaults used by both the API and upcoming auth flows.
 * Keeping the loader here avoids scattering JWT/bcrypt settings across apps.
 */
export function loadSecurityConfig(
  env: Record<string, string | undefined> = process.env,
): SecurityConfig {
  if (!cachedConfig) {
    cachedConfig = SecurityConfigSchema.parse(env);
  }

  return cachedConfig;
}
