declare module "bcrypt" {
  export function hash(
    data: string,
    saltOrRounds: string | number,
  ): Promise<string>;
  export function compare(data: string, encrypted: string): Promise<boolean>;
}

declare module "jsonwebtoken" {
  export interface SignOptions {
    readonly algorithm?: string;
    readonly expiresIn?: string | number;
    readonly issuer?: string;
    readonly audience?: string | string[];
  }

  export interface VerifyOptions {
    readonly algorithms?: string[];
    readonly issuer?: string | string[];
    readonly audience?: string | string[];
  }

  export interface JwtPayload {
    [key: string]: unknown;
    sub?: string;
    exp?: number;
    iat?: number;
  }

  export function sign(
    payload: object,
    secretOrPrivateKey: string,
    options?: SignOptions,
  ): string;

  export function verify(
    token: string,
    secretOrPublicKey: string,
    options?: VerifyOptions,
  ): JwtPayload | string;

  const jsonwebtoken: {
    sign: typeof sign;
    verify: typeof verify;
  };

  export default jsonwebtoken;
  export { sign, verify };
}
