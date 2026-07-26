import axios from "axios";

export const api = axios.create({
  baseURL: "https://aadhyarajhrms-1.onrender.com/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("aadhyaraj_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface ApiErrorShape {
  error: { message: string; details?: Record<string, string[]> };
}

export function getErrorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as ApiErrorShape | undefined;
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
    if (axios.isAxiosError(err) && err.response?.status === 401 && onUnauthorized) {
      onUnauthorized();
    }
    return Promise.reject(err);
  }
);
