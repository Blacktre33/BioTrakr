import axios from "axios";

// Hardcoded base URL for now to ensure it works with the running API server
// In production, this should come from env vars or config
const API_BASE_URL = "http://localhost:3001/api";

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
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle network errors (API server not running, CORS, etc.)
    if (!error.response) {
      const isNetworkError = error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK' || error.message === 'Network Error';
      const message = isNetworkError
        ? `Cannot connect to API server at ${API_BASE_URL}. Please ensure the API server is running on port 3001.`
        : error.message || "An unexpected error occurred while communicating with the API.";
      
      const payload: ApiErrorPayload = {
        message,
        statusCode: undefined,
        details: {
          code: error.code,
          originalError: error.message,
        },
      };

      return Promise.reject(new ApiError(payload));
    }

    // Handle HTTP errors (4xx, 5xx)
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

