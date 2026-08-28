import type { TrueForge, TrueForgeApi } from "@truefoundry/trueforge-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  startVerdictInvestigation,
  VERDICT_HUNTER_START_TIMEOUT_MS,
  type InvestigationTarget,
  type WorkflowDispatchTarget,
} from "../src/session.js";

const target: InvestigationTarget = {
  issueNumber: 417,
  repository: "truefoundry/trueforge",
  sourceManifestId: "trueforge-417-v1",
};

const workflowTarget: WorkflowDispatchTarget = {
  approvalNonce: "0123456789abcdef0123456789abcdef",
  owner: "himanshu748",
  ref: "main",
  repo: "verdict",
  workflowId: "verdict-day4-proof.yml",
};

const turnCreated = {
  type: "turn.created",
  id: "event-turn",
  createdAt: "2026-08-28T00:00:00.000Z",
  turnId: "turn-1",
  threadId: "thread-root",
  previousTurnId: null,
  state: { status: "running" },
} satisfies TrueForgeApi.TurnCreatedEvent;

const wrongSubagentCreated = {
  type: "thread.created",
  id: "event-thread-wrong",
  createdAt: "2026-08-28T00:00:01.000Z",
  threadId: "thread-surgeon",
  title: "Surgeon",
  parent: { threadId: "thread-root", toolCallId: "spawn-surgeon" },
  agentInfo: { type: "dynamic", name: "Surgeon", input: "Investigate." },
} satisfies TrueForgeApi.ThreadCreatedEvent;

function createClient(
  createTurnStream: ReturnType<typeof vi.fn>,
  cancel = vi.fn().mockResolvedValue({ data: {} }),
): { cancel: ReturnType<typeof vi.fn>; client: TrueForge } {
  return {
    cancel,
    client: {
      sessions: {
        cancel,
        create: vi.fn().mockResolvedValue({ data: { id: "session-1" } }),
        createTurnStream,
      },
    } as unknown as TrueForge,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("investigation start safety", () => {
  it("cancels a root turn that does not create Hunter", async () => {
    vi.useFakeTimers();
    const createTurnStream = vi.fn(
      async (
        _sessionId: string,
        _request: unknown,
        requestOptions: { abortSignal?: AbortSignal },
      ) => ({
        [Symbol.asyncIterator]() {
          let eventIndex = 0;
          return {
            next: async () => {
              if (eventIndex === 0) {
                eventIndex += 1;
                return { done: false as const, value: turnCreated };
              }
              if (eventIndex === 1) {
                eventIndex += 1;
                return { done: false as const, value: wrongSubagentCreated };
              }
              return new Promise<IteratorResult<TrueForgeApi.TurnStreamingEvent>>(
                (_resolve, reject) => {
                  requestOptions.abortSignal?.addEventListener(
                    "abort",
                    () => reject(new Error("The operation was aborted")),
                    { once: true },
                  );
                },
              );
            },
          };
        },
      }),
    );
    const { cancel, client } = createClient(createTurnStream);

    const result = expect(
      startVerdictInvestigation(client, target, workflowTarget),
    ).rejects.toThrow(
      "Provider stalled before creating the required Hunter subagent.",
    );
    await vi.advanceTimersByTimeAsync(VERDICT_HUNTER_START_TIMEOUT_MS);

    await result;
    expect(cancel).toHaveBeenCalledWith(
      "session-1",
      {},
      { maxRetries: 0, timeoutInSeconds: 10 },
    );
  });

  it("cancels the session before propagating a transport failure", async () => {
    const transportError = new Error("read ECONNRESET");
    const createTurnStream = vi.fn().mockRejectedValue(transportError);
    const { cancel, client } = createClient(createTurnStream);

    await expect(
      startVerdictInvestigation(client, target, workflowTarget),
    ).rejects.toBe(transportError);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("disables the root watchdog after the first subagent is observed", async () => {
    vi.useFakeTimers();
    const threadCreated = {
      type: "thread.created",
      id: "event-thread",
      createdAt: "2026-08-28T00:00:01.000Z",
      threadId: "thread-hunter",
      title: "Hunter",
      parent: { threadId: "thread-root", toolCallId: "spawn-hunter" },
      agentInfo: { type: "dynamic", name: "Hunter", input: "Investigate." },
    } satisfies TrueForgeApi.ThreadCreatedEvent;
    const turnDone = {
      type: "turn.done",
      id: "event-done",
      createdAt: "2026-08-28T00:00:02.000Z",
      threadId: "thread-root",
      state: {
        status: "done",
        completedAt: "2026-08-28T00:00:02.000Z",
        output: null,
        requiredActions: [],
      },
    } satisfies TrueForgeApi.TurnDoneEvent;
    const createTurnStream = vi.fn().mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield turnCreated;
        yield threadCreated;
        yield turnDone;
      },
    });
    const { cancel, client } = createClient(createTurnStream);

    await expect(
      startVerdictInvestigation(client, target, workflowTarget),
    ).resolves.toMatchObject({ status: "done" });
    await vi.advanceTimersByTimeAsync(VERDICT_HUNTER_START_TIMEOUT_MS);
    expect(cancel).not.toHaveBeenCalled();
  });
});
