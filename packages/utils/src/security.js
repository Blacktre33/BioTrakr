"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.createAccessToken = createAccessToken;
exports.createRefreshToken = createRefreshToken;
exports.createTokenPair = createTokenPair;
exports.verifyAccessToken = verifyAccessToken;
exports.verifyRefreshToken = verifyRefreshToken;
exports.getBearerToken = getBearerToken;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../../config/src");
function resolveSaltRounds(explicit) {
    if (explicit && explicit > 0) {
        return explicit;
    }
    return (0, config_1.loadSecurityConfig)().passwordSaltRounds;
}
async function hashPassword(password, saltRounds) {
    const rounds = resolveSaltRounds(saltRounds);
    return bcrypt_1.default.hash(password, rounds);
}
async function verifyPassword(password, hash) {
    return bcrypt_1.default.compare(password, hash);
}
function buildAccessTokenClaims(user) {
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
function createAccessToken(user, options = {}) {
    const security = (0, config_1.loadSecurityConfig)();
    const claims = buildAccessTokenClaims(user);
    const issuer = options.issuer ?? security.jwtIssuer ?? undefined;
    const audience = options.audience ?? security.jwtAudience ?? undefined;
    const signOptions = {
        algorithm: "HS256",
        expiresIn: options.expiresIn ?? security.accessTokenTtlSeconds,
        ...(issuer !== undefined ? { issuer } : {}),
        ...(audience !== undefined ? { audience } : {}),
    };
    return jsonwebtoken_1.default.sign(claims, security.jwtSecret, signOptions);
}
function createRefreshToken(user, options = {}) {
    const security = (0, config_1.loadSecurityConfig)();
    const claims = {
        sub: user.id,
        type: "refresh",
    };
    const issuer = options.issuer ?? security.jwtIssuer ?? undefined;
    const audience = options.audience ?? security.jwtAudience ?? undefined;
    const signOptions = {
        algorithm: "HS256",
        expiresIn: options.expiresIn ?? security.refreshTokenTtlSeconds,
        ...(issuer !== undefined ? { issuer } : {}),
        ...(audience !== undefined ? { audience } : {}),
    };
    return jsonwebtoken_1.default.sign(claims, security.jwtSecret, signOptions);
}
function createTokenPair(user) {
    const security = (0, config_1.loadSecurityConfig)();
    const accessToken = createAccessToken(user);
    const refreshToken = createRefreshToken(user);
    return {
        accessToken,
        refreshToken,
        expiresInSeconds: security.accessTokenTtlSeconds,
    };
}
function verifyAccessToken(token, options = {}) {
    const security = (0, config_1.loadSecurityConfig)();
    const payload = jsonwebtoken_1.default.verify(token, security.jwtSecret, {
        algorithms: ["HS256"],
        issuer: security.jwtIssuer ?? undefined,
        audience: security.jwtAudience ?? undefined,
        ...options,
    });
    if (typeof payload === "string") {
        throw new Error("Invalid JWT payload format.");
    }
    return payload;
}
function verifyRefreshToken(token, options = {}) {
    const security = (0, config_1.loadSecurityConfig)();
    const payload = jsonwebtoken_1.default.verify(token, security.jwtSecret, {
        algorithms: ["HS256"],
        issuer: security.jwtIssuer ?? undefined,
        audience: security.jwtAudience ?? undefined,
        ...options,
    });
    if (typeof payload === "string") {
        throw new Error("Invalid refresh token payload.");
    }
    const claims = payload;
    if (claims.type !== "refresh") {
        throw new Error("Invalid refresh token payload.");
    }
    return claims;
}
function getBearerToken(header) {
    if (!header) {
        throw new Error("Missing Authorization header.");
    }
    const [scheme, value] = header.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !value) {
        throw new Error("Authorization header must use the Bearer scheme.");
    }
    return value;
}
//# sourceMappingURL=security.js.map