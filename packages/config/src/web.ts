import { z } from "zod";

/**
 * The web client only consumes NEXT_PUBLIC variables which Next.js injects at
 * build time. No defaults are provided so we never fall back to hard coded
 * localhost values by accident.
 */
const WebConfigSchema = z
  .object({
    NEXT_PUBLIC_API_URL: z
      .string()
      .url("NEXT_PUBLIC_API_URL must point at the BioTrakr API gateway."),
    NEXT_PUBLIC_APP_URL: z
      .string()
      .url("NEXT_PUBLIC_APP_URL should describe the deployed Next.js origin.")
      .optional(),
    NEXT_PUBLIC_AUTH_DOMAIN: z.string().optional(),
    NEXT_PUBLIC_AUTH_AUDIENCE: z.string().optional(),
  })
  .transform((value) => {
    return {
      apiBaseUrl: value.NEXT_PUBLIC_API_URL,
      appUrl:
        value.NEXT_PUBLIC_APP_URL ??
        value.NEXT_PUBLIC_API_URL.replace(/\/api$/u, ""),
      auth: {
        domain: value.NEXT_PUBLIC_AUTH_DOMAIN ?? null,
        audience: value.NEXT_PUBLIC_AUTH_AUDIENCE ?? null,
      },
    } satisfies WebConfig;
  });

export interface WebConfigAuth {
  readonly domain: string | null;
  readonly audience: string | null;
}

export interface WebConfig {
  readonly apiBaseUrl: string;
  readonly appUrl: string;
  readonly auth: WebConfigAuth;
}

let cachedConfig: WebConfig | undefined;

/**
 * Parses and memoises the Next.js build-time environment configuration. The
 * optional `env` parameter allows Playwright/Jest to inject custom values.
 */
export function loadWebConfig(
  env: Record<string, string | undefined> = process.env,
): WebConfig {
  if (!cachedConfig) {
    cachedConfig = WebConfigSchema.parse(env);
  }

  return cachedConfig;
}
