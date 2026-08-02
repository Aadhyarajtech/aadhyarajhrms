// path: src/lib/api.ts
import axios from "axios";

// In local development, always go through Vite's proxy so the UI talks to
// the backend running on localhost:4000. Only use the explicit public URL in
// production builds.
const API_BASE_URL = import.meta.env.DEV
  ? "/api"
  : import.meta.env.VITE_API_URL || "https://aadhyarajhrms-1.onrender.com/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
  // Render free-tier services spin down when idle and can take 30-50s to
  // wake up on the first request. A short default timeout would fail that
  // request before the server ever responds, showing a generic error even
  // though credentials were correct. 60s gives cold starts room to finish.
  timeout: 60_000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("aadhyaraj_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface ApiErrorShape {
  error: { message: string; details?: Record<string, string[]> };
}

export function getErrorMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (axios.isAxiosError(err)) {
    // No response at all means the request never completed (network error,
    // CORS block, or timeout) rather than the server rejecting credentials.
    if (!err.response) {
      if (err.code === "ECONNABORTED") {
        return "The server is waking up (this can take up to a minute on the first request). Please try again.";
      }
      return "Couldn't reach the server. Check your connection and try again.";
    }
    const data = err.response.data as ApiErrorShape | undefined;
    return data?.error?.message || fallback;
  }
  return fallback;
}

let onUnauthorized: (() => void) | null = null;
export function registerUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (
      axios.isAxiosError(err) &&
      err.response?.status === 401 &&
      onUnauthorized
    ) {
      onUnauthorized();
    }
    return Promise.reject(err);
  },
);
