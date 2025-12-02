"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadApiConfig = loadApiConfig;
const zod_1 = require("zod");
const ApiConfigSchema = zod_1.z
    .object({
    NODE_ENV: zod_1.z
        .enum(["development", "test", "production"])
        .default("development"),
    API_PORT: zod_1.z.coerce.number().int().positive().default(3001),
    CLIENT_URL: zod_1.z
        .string()
        .url("CLIENT_URL must be a fully-qualified URL so CORS rules stay strict."),
    ALLOWED_ORIGINS: zod_1.z
        .string()
        .regex(/^[^\s]+(,[^\s]+)*$/u, {
        message: "ALLOWED_ORIGINS must be a comma-separated list of URLs.",
    })
        .optional(),
    DATABASE_URL: zod_1.z
        .string()
        .min(1, "DATABASE_URL is required for Prisma to connect."),
    SHADOW_DATABASE_URL: zod_1.z
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
    };
});
let cachedConfig;
function loadApiConfig(env = process.env) {
    if (!cachedConfig) {
        cachedConfig = ApiConfigSchema.parse(env);
    }
    return cachedConfig;
}
//# sourceMappingURL=api.js.map