import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

import { clearSession, getSession, redirectToLogin, setSession, type Session } from "@/lib/auth/session";

// Set NEXT_PUBLIC_API_URL for any non-local deployment.
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export interface ApiErrorPayload {
  message: string;
  statusCode?: number;
  details?: unknown;
}

export class ApiError extends Error {
  statusCode?: number;
  details?: unknown;

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.statusCode = payload.statusCode;
    this.details = payload.details;
  }
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
});

// Attach the signed-in user's access token to every request.
api.interceptors.request.use((config) => {
  const token = getSession()?.accessToken;
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

let refreshing: Promise<Session | null> | null = null;

/** Exchanges the refresh token once, even if several requests expire together. */
function refreshSession(): Promise<Session | null> {
  const current = getSession();
  if (!current) return Promise.resolve(null);

  refreshing ??= axios
    .post<Session>(`${API_BASE_URL}/auth/refresh`, { refreshToken: current.refreshToken })
    .then(({ data }) => {
      setSession(data);
      return data;
    })
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ message?: string | string[] }>) => {
    const original = error.config as RetriableConfig | undefined;

    // Expired access token: refresh once and replay the request. Never for
    // /auth/* itself, or a wrong password would revive an old stored session.
    const isAuthRoute = original?.url?.startsWith("/auth/") ?? false;
    if (error.response?.status === 401 && original && !original._retried && !isAuthRoute) {
      original._retried = true;
      const session = await refreshSession();
      if (session) {
        original.headers.set("Authorization", `Bearer ${session.accessToken}`);
        return api(original);
      }
      clearSession();
      redirectToLogin();
    }

    // Network errors (API server not running, CORS, etc.)
    if (!error.response) {
      const isNetworkError = error.code === "ECONNREFUSED" || error.code === "ERR_NETWORK";
      return Promise.reject(
        new ApiError({
          message: isNetworkError
            ? `Cannot connect to API server at ${API_BASE_URL}. Please ensure the API server is running.`
            : error.message || "An unexpected error occurred while communicating with the API.",
          details: { code: error.code, originalError: error.message },
        }),
      );
    }

    const raw = error.response.data?.message;
    return Promise.reject(
      new ApiError({
        message:
          (Array.isArray(raw) ? raw.join("; ") : raw) ??
          error.message ??
          "An unexpected error occurred while communicating with the API.",
        statusCode: error.response.status,
        details: error.response.data,
      }),
    );
  },
);
