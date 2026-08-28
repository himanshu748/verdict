import type { VerdictEventProjection } from "./session.js";

export const VERDICT_PROVIDER_MAX_ATTEMPTS = 3;
export const VERDICT_PROVIDER_RETRY_DELAY_MS = 1_000;

const TRANSIENT_PROVIDER_MARKERS = [
  "cannot connect to api",
  "eai_again",
  "econnreset",
  "etimedout",
  "fetch failed",
  "network connection was lost",
  "socket hang up",
  "und_err_connect_timeout",
] as const;

export interface TransientProviderRetryEvent {
  attempt: number;
  delayMs: number;
  maxAttempts: number;
}

export interface TransientProviderRetryOptions {
  initialDelayMs?: number;
  maxAttempts?: number;
  onRetry?: (event: TransientProviderRetryEvent) => void;
  sleep?: (milliseconds: number) => Promise<void>;
}

export function isTransientProviderFailure(
  message: string | null | undefined,
): boolean {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return TRANSIENT_PROVIDER_MARKERS.some((marker) =>
    normalized.includes(marker),
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertRetryOptions(maxAttempts: number, initialDelayMs: number): void {
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
    throw new Error("maxAttempts must be an integer between 1 and 5.");
  }
  if (!Number.isSafeInteger(initialDelayMs) || initialDelayMs < 0) {
    throw new Error("initialDelayMs must be a non-negative integer.");
  }
}

/**
 * Retries only the pre-approval investigation start. Approval resolution and
 * protected writes are deliberately outside this boundary and are never
 * replayed by this helper.
 */
export async function startWithTransientProviderRetry(
  start: () => Promise<VerdictEventProjection>,
  options: TransientProviderRetryOptions = {},
): Promise<VerdictEventProjection> {
  const maxAttempts = options.maxAttempts ?? VERDICT_PROVIDER_MAX_ATTEMPTS;
  const initialDelayMs =
    options.initialDelayMs ?? VERDICT_PROVIDER_RETRY_DELAY_MS;
  const sleep =
    options.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  assertRetryOptions(maxAttempts, initialDelayMs);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const projection = await start();
      const shouldRetry =
        projection.status === "error" &&
        isTransientProviderFailure(projection.error) &&
        attempt < maxAttempts;

      if (!shouldRetry) {
        return projection;
      }
    } catch (error) {
      if (
        !isTransientProviderFailure(errorMessage(error)) ||
        attempt >= maxAttempts
      ) {
        throw error;
      }
    }

    const delayMs = initialDelayMs * 2 ** (attempt - 1);
    options.onRetry?.({ attempt, delayMs, maxAttempts });
    await sleep(delayMs);
  }

  throw new Error("Transient provider retry loop ended unexpectedly.");
}
