// path: frontend/src/lib/api.ts

import axios from "axios";

// In local development, always go through Vite's proxy so the UI talks to
// the backend running on localhost:4000. Only use the explicit public URL in
// production builds.
const API_BASE_URL = import.meta.env.DEV
  ? "/api"
  : import.meta.env.VITE_API_URL ||
    "https://aadhyarajhrms-1.onrender.com/api";

export const api = axios.create({
  baseURL: API_BASE_URL,

  // Render free-tier services spin down when idle and can take 30-50s to
  // wake up on the first request. A short default timeout would fail that
  // request before the server ever responds, showing a generic error even
  // though credentials were correct. 60s gives cold starts room to finish.
  timeout: 60_000,
});

// Attach the authentication token to every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("aadhyaraj_token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export interface ApiErrorShape {
  error: {
    message: string;
    details?: Record<string, string[]>;
  };
}

// Extract a useful error message from API errors.
export function getErrorMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (axios.isAxiosError(err)) {
    // No response means a network error, CORS issue, or timeout.
    if (!err.response) {
      if (err.code === "ECONNABORTED") {
        return "The server is waking up (this can take up to a minute on the first request). Please try again.";
      }

      return "Couldn't reach the server. Check your connection and try again.";
    }

    const data = err.response.data as ApiErrorShape | undefined;
    const message = data?.error?.message;
    const details = data?.error?.details;

    // Show field-level validation errors when available.
    if (details && typeof details === "object") {
      const fieldMessages = Object.entries(details)
        .flatMap(([field, messages]) =>
          Array.isArray(messages)
            ? messages.map((item) => `${field}: ${item}`)
            : [],
        )
        .filter(Boolean);

      if (fieldMessages.length) {
        return fieldMessages.join(" ");
      }
    }

    return message || fallback;
  }

  return fallback;
}

// Resolve relative asset paths to usable URLs.
export function resolveAssetUrl(
  value?: string | null,
): string | null {
  if (!value) {
    return null;
  }

  if (
    value.startsWith("http://") ||
    value.startsWith("https://")
  ) {
    return value;
  }

  const rawBase = import.meta.env.VITE_API_URL || "/api";

  const baseOrigin = rawBase.startsWith("http")
    ? new URL(rawBase).origin
    : window.location.origin;

  return new URL(
    value.startsWith("/") ? value : `/${value}`,
    baseOrigin,
  ).toString();
}

// Centralized unauthorized response handler.
let onUnauthorized: (() => void) | null = null;

export function registerUnauthorizedHandler(
  handler: () => void,
) {
  onUnauthorized = handler;
}

// Centralized response handling.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (!axios.isAxiosError(err)) {
      return Promise.reject(err);
    }

    const status = err.response?.status;

    const errorData = err.response?.data as
      | {
          error?: {
            code?: string;
          };
        }
      | undefined;

    // Force temporary password reset when required by the backend.
    if (
      status === 403 &&
      errorData?.error?.code === "PASSWORD_RESET_REQUIRED"
    ) {
      const resetPath = "/change-temporary-password";

      if (window.location.pathname !== resetPath) {
        window.location.replace(resetPath);
      }
    }

    // Preserve existing unauthorized logout behavior.
    if (status === 401 && onUnauthorized) {
      onUnauthorized();
    }

    return Promise.reject(err);
  },
);