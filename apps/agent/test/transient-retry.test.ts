import { describe, expect, it, vi } from "vitest";
import type { VerdictEventProjection } from "../src/session.js";
import {
  isTransientProviderFailure,
  startWithTransientProviderRetry,
} from "../src/transient-retry.js";

function projection(
  status: VerdictEventProjection["status"],
  error: string | null = null,
): VerdictEventProjection {
  return {
    assistantText: "",
    error,
    modelToolCalls: [],
    pendingApprovals: [],
    sessionId: "session-1",
    status,
    threads: [],
    turnId: "turn-1",
  };
}

describe("transient provider retry", () => {
  it.each([
    "Cannot connect to API: Connect Timeout Error",
    "read ECONNRESET",
    "TypeError: fetch failed",
    "UND_ERR_CONNECT_TIMEOUT",
    "Provider stalled before creating the required Hunter subagent.",
  ])("recognizes retryable provider failure: %s", (message) => {
    expect(isTransientProviderFailure(message)).toBe(true);
  });

  it.each([
    "Unauthorized",
    "Rate limit exceeded",
    "Policy rejected the tool call",
    null,
  ])("does not retry non-transient failure: %s", (message) => {
    expect(isTransientProviderFailure(message)).toBe(false);
  });

  it("returns the first successful projection without sleeping", async () => {
    const start = vi.fn().mockResolvedValue(projection("done"));
    const sleep = vi.fn();

    await expect(
      startWithTransientProviderRetry(start, { sleep }),
    ).resolves.toMatchObject({ status: "done" });
    expect(start).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries transient error projections with bounded backoff", async () => {
    const start = vi
      .fn()
      .mockResolvedValueOnce(projection("error", "read ECONNRESET"))
      .mockResolvedValueOnce(
        projection("error", "Cannot connect to API: fetch failed"),
      )
      .mockResolvedValueOnce(projection("approval_required"));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const onRetry = vi.fn();

    await expect(
      startWithTransientProviderRetry(start, {
        initialDelayMs: 25,
        onRetry,
        sleep,
      }),
    ).resolves.toMatchObject({ status: "approval_required" });
    expect(start).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[25], [50]]);
    expect(onRetry.mock.calls).toEqual([
      [{ attempt: 1, delayMs: 25, maxAttempts: 3 }],
      [{ attempt: 2, delayMs: 50, maxAttempts: 3 }],
    ]);
  });

  it("retries a thrown transient transport error", async () => {
    const start = vi
      .fn()
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce(projection("done"));

    await expect(
      startWithTransientProviderRetry(start, {
        initialDelayMs: 0,
        sleep: vi.fn(),
      }),
    ).resolves.toMatchObject({ status: "done" });
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("returns the final transient error after the attempt limit", async () => {
    const final = projection("error", "read ECONNRESET");
    const start = vi.fn().mockResolvedValue(final);

    await expect(
      startWithTransientProviderRetry(start, {
        initialDelayMs: 0,
        maxAttempts: 2,
        sleep: vi.fn(),
      }),
    ).resolves.toBe(final);
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-transient error projection", async () => {
    const result = projection("error", "Unauthorized");
    const start = vi.fn().mockResolvedValue(result);

    await expect(
      startWithTransientProviderRetry(start, { sleep: vi.fn() }),
    ).resolves.toBe(result);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid retry bounds before starting", async () => {
    const start = vi.fn();

    await expect(
      startWithTransientProviderRetry(start, { maxAttempts: 6 }),
    ).rejects.toThrow("maxAttempts must be an integer between 1 and 5.");
    expect(start).not.toHaveBeenCalled();
  });
});
