"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadWebConfig = loadWebConfig;
const zod_1 = require("zod");
const WebConfigSchema = zod_1.z
    .object({
    NEXT_PUBLIC_API_URL: zod_1.z
        .string()
        .url("NEXT_PUBLIC_API_URL must point at the BioTrakr API gateway."),
    NEXT_PUBLIC_APP_URL: zod_1.z
        .string()
        .url("NEXT_PUBLIC_APP_URL should describe the deployed Next.js origin.")
        .optional(),
    NEXT_PUBLIC_AUTH_DOMAIN: zod_1.z.string().optional(),
    NEXT_PUBLIC_AUTH_AUDIENCE: zod_1.z.string().optional(),
})
    .transform((value) => {
    return {
        apiBaseUrl: value.NEXT_PUBLIC_API_URL,
        appUrl: value.NEXT_PUBLIC_APP_URL ??
            value.NEXT_PUBLIC_API_URL.replace(/\/api$/u, ""),
        auth: {
            domain: value.NEXT_PUBLIC_AUTH_DOMAIN ?? null,
            audience: value.NEXT_PUBLIC_AUTH_AUDIENCE ?? null,
        },
    };
});
let cachedConfig;
function loadWebConfig(env = process.env) {
    if (!cachedConfig) {
        cachedConfig = WebConfigSchema.parse(env);
    }
    return cachedConfig;
}
//# sourceMappingURL=web.js.map