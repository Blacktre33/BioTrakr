import { type JwtPayload, type SignOptions, type VerifyOptions } from "jsonwebtoken";
import type { AuthenticatedUser, Permission, TokenPair, UserRole } from "@biotrakr/types";
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
export interface RefreshTokenClaims extends JwtPayload {
    sub: string;
    type: "refresh";
}
export declare function hashPassword(password: string, saltRounds?: number): Promise<string>;
export declare function verifyPassword(password: string, hash: string): Promise<boolean>;
export declare function createAccessToken(user: AuthenticatedUser, options?: Partial<SignOptions>): string;
export declare function createRefreshToken(user: AuthenticatedUser, options?: Partial<SignOptions>): string;
export declare function createTokenPair(user: AuthenticatedUser): TokenPair;
export interface VerifyAccessTokenOptions extends Omit<VerifyOptions, "algorithms"> {
}
export declare function verifyAccessToken(token: string, options?: VerifyAccessTokenOptions): AccessTokenClaims;
export declare function verifyRefreshToken(token: string, options?: VerifyAccessTokenOptions): RefreshTokenClaims;
export declare function getBearerToken(header: string | null | undefined): string;
