import { env } from "./env";

export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
  meta: Record<string, unknown>;
}

interface ApiErrorBody {
  success: false;
  message: string;
  code: string;
  errors: unknown[];
}

/** Mirrors the backend error contract: `{ success, message, code, errors }`. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly errors: unknown[];

  constructor(status: number, message: string, code = "REQUEST_FAILED", errors: unknown[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.errors = errors;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }

  /** `errors[0].retryAfterSeconds` for 429 responses (OTP cooldown / rate limit). */
  get retryAfterSeconds(): number | undefined {
    const first = this.errors[0];

    if (typeof first === "object" && first !== null && "retryAfterSeconds" in first) {
      const value = (first as { retryAfterSeconds?: unknown }).retryAfterSeconds;

      return typeof value === "number" ? value : undefined;
    }

    return undefined;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

/** Single entry point for every HTTP call (S1-F2). */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiSuccess<T>> {
  let response: Response;

  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, {
      method: options.method ?? "GET",
      credentials: "include",
      cache: "no-store",
      headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;

    throw new ApiError(0, "Cannot reach the NoteKoi API. Is the server running?", "NETWORK_ERROR");
  }

  const payload = (await response.json().catch(() => null)) as ApiSuccess<T> | ApiErrorBody | null;

  if (!response.ok || payload === null || payload.success === false) {
    const failure = payload as ApiErrorBody | null;

    throw new ApiError(
      response.status,
      failure?.message ?? `Request failed with status ${response.status}`,
      failure?.code ?? "REQUEST_FAILED",
      failure?.errors ?? [],
    );
  }

  return payload;
}

export const apiGet = async <T>(path: string, signal?: AbortSignal): Promise<T> =>
  (await apiRequest<T>(path, { signal })).data;

export const apiPost = async <T>(path: string, body: unknown): Promise<ApiSuccess<T>> =>
  apiRequest<T>(path, { method: "POST", body });
