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
export declare function loadSecurityConfig(env?: Record<string, string | undefined>): SecurityConfig;
