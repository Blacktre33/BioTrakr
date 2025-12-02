export interface WebConfigAuth {
    readonly domain: string | null;
    readonly audience: string | null;
}
export interface WebConfig {
    readonly apiBaseUrl: string;
    readonly appUrl: string;
    readonly auth: WebConfigAuth;
}
export declare function loadWebConfig(env?: Record<string, string | undefined>): WebConfig;
