export interface ApiConfig {
    readonly nodeEnv: "development" | "test" | "production";
    readonly port: number;
    readonly clientUrl: string;
    readonly allowedOrigins: string[];
    readonly databaseUrl: string;
    readonly shadowDatabaseUrl?: string;
}
export declare function loadApiConfig(env?: Record<string, string | undefined>): ApiConfig;
