"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSecurityConfig = loadSecurityConfig;
const zod_1 = require("zod");
const SecurityConfigSchema = zod_1.z
    .object({
    JWT_SECRET: zod_1.z
        .string()
        .min(32, "JWT_SECRET must be at least 32 characters."),
    JWT_ISSUER: zod_1.z.string().optional(),
    JWT_AUDIENCE: zod_1.z.string().optional(),
    JWT_ACCESS_TOKEN_TTL: zod_1.z.coerce
        .number()
        .int()
        .positive()
        .default(15 * 60),
    JWT_REFRESH_TOKEN_TTL: zod_1.z.coerce
        .number()
        .int()
        .positive()
        .default(7 * 24 * 60 * 60),
    PASSWORD_SALT_ROUNDS: zod_1.z.coerce
        .number()
        .int()
        .min(10, "PASSWORD_SALT_ROUNDS should be at least 10 for bcrypt.")
        .default(12),
    CSRF_COOKIE_NAME: zod_1.z.string().default("biotrakr.csrf"),
    CSRF_HEADER_NAME: zod_1.z.string().default("x-biotrakr-csrf-token"),
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
    };
});
let cachedConfig;
function loadSecurityConfig(env = process.env) {
    if (!cachedConfig) {
        cachedConfig = SecurityConfigSchema.parse(env);
    }
    return cachedConfig;
}
//# sourceMappingURL=security.js.map