import { z } from "zod";

/**
 * Parsing schema for API-specific configuration. Keeping this close to the
 * loader ensures any new environment variables are validated in one place.
 */
const ApiConfigSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    API_PORT: z.coerce.number().int().positive().default(3001),
    CLIENT_URL: z
      .string()
      .url(
        "CLIENT_URL must be a fully-qualified URL so CORS rules stay strict.",
      ),
    ALLOWED_ORIGINS: z
      .string()
      .regex(/^[^\s]+(,[^\s]+)*$/u, {
        message: "ALLOWED_ORIGINS must be a comma-separated list of URLs.",
      })
      .optional(),
    DATABASE_URL: z
      .string()
      .min(1, "DATABASE_URL is required for Prisma to connect."),
    SHADOW_DATABASE_URL: z
      .string()
      .min(1, "SHADOW_DATABASE_URL is required when running migrations.")
      .optional(),
  })
  .transform((value) => {
    const explicitOrigins = value.ALLOWED_ORIGINS
      ? value.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
      : [];

    return {
      nodeEnv: value.NODE_ENV,
      port: value.API_PORT,
      clientUrl: value.CLIENT_URL,
      allowedOrigins: explicitOrigins.length
        ? explicitOrigins
        : [value.CLIENT_URL],
      databaseUrl: value.DATABASE_URL,
      shadowDatabaseUrl: value.SHADOW_DATABASE_URL,
    } satisfies ApiConfig;
  });

export interface ApiConfig {
  readonly nodeEnv: "development" | "test" | "production";
  readonly port: number;
  readonly clientUrl: string;
  readonly allowedOrigins: string[];
  readonly databaseUrl: string;
  readonly shadowDatabaseUrl?: string;
}

let cachedConfig: ApiConfig | undefined;

/**
 * Validates the environment variables backing the NestJS API. Using a cached
 * result prevents redundant parsing inside request-scoped contexts.
 */
export function loadApiConfig(
  env: Record<string, string | undefined> = process.env,
): ApiConfig {
  if (!cachedConfig) {
    cachedConfig = ApiConfigSchema.parse(env);
  }

  return cachedConfig;
}
