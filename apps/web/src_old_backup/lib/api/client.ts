import axios from "axios";

import { loadWebConfig } from "@medasset/config";

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

// Resolve the runtime configuration via the shared loader so the web app stays
// in lockstep with the API gateway without hard-coded localhost defaults.
// Fallback to localhost for dev when env vars aren't available during SSR.
function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  try {
    return loadWebConfig().apiBaseUrl;
  } catch (error) {
    if (typeof window === "undefined") {
      return "http://localhost:3001";
    }
    throw error;
  }
}

export const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 15_000,
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const payload: ApiErrorPayload = {
      message:
        error.response?.data?.message ??
        error.message ??
        "An unexpected error occurred while communicating with the API.",
      statusCode: error.response?.status,
      details: error.response?.data,
    };

    return Promise.reject(new ApiError(payload));
  }
);

export function setAuthToken(token?: string | null) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}
