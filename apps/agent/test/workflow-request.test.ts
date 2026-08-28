import type { TrueForge, TrueForgeApi } from "@truefoundry/trueforge-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildWorkflowApprovalRequestMessage,
  classifyMissingWorkflowApproval,
  createVerdictProjection,
  failIncompleteInvestigation,
  failMissingWorkflowApprovalAttempt,
  requestMissingWorkflowApproval,
  shouldRequestMissingWorkflowApproval,
  VERDICT_WORKFLOW_REQUEST_TIMEOUT_MS,
  type VerdictEventProjection,
  type WorkflowDispatchTarget,
} from "../src/session.js";

const workflowTarget: WorkflowDispatchTarget = {
  approvalNonce: "0123456789abcdef0123456789abcdef",
  owner: "himanshu748",
  ref: "main",
  repo: "verdict",
  workflowId: "verdict-day4-proof.yml",
};

function completedProjection(): VerdictEventProjection {
  return {
    ...createVerdictProjection("session-1"),
    status: "done",
    threads: [
      {
        name: "Hunter",
        status: "done",
        threadId: "thread-hunter",
        title: "Hunter",
      },
      {
        name: "Surgeon",
        status: "done",
        threadId: "thread-surgeon",
        title: "Surgeon",
      },
      {
        name: "Insurance",
        status: "done",
        threadId: "thread-insurance",
        title: "Insurance",
      },
    ],
    turnId: "turn-1",
  };
}

function createClient(
  createTurnStream: ReturnType<typeof vi.fn>,
  cancel = vi.fn().mockResolvedValue({ data: {} }),
): { cancel: ReturnType<typeof vi.fn>; client: TrueForge } {
  return {
    cancel,
    client: {
      sessions: { cancel, createTurnStream },
    } as unknown as TrueForge,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("missing workflow approval correction", () => {
  it("detects all completed acts without a workflow attempt", () => {
    expect(shouldRequestMissingWorkflowApproval(completedProjection())).toBe(
      true,
    );
  });

  it("fails closed when any observed act is missing", () => {
    const projection = completedProjection();
    projection.threads = projection.threads.filter(
      (thread) => thread.name !== "Surgeon",
    );

    expect(shouldRequestMissingWorkflowApproval(projection)).toBe(false);
    expect(classifyMissingWorkflowApproval(projection)).toBe(
      "investigation_incomplete",
    );
    expect(failIncompleteInvestigation(projection)).toMatchObject({
      error:
        "Verdict completed without observing Hunter, Surgeon and Insurance finish as dynamic subagents in order.",
      status: "error",
    });
  });

  it("requires the observed acts to complete in order", () => {
    const projection = completedProjection();
    projection.threads = [
      projection.threads[2]!,
      projection.threads[0]!,
      projection.threads[1]!,
    ];

    expect(classifyMissingWorkflowApproval(projection)).toBe(
      "investigation_incomplete",
    );
  });

  it("accepts the required act identity from an observed thread title", () => {
    const projection = completedProjection();
    projection.threads = projection.threads.map((thread, index) => ({
      ...thread,
      name: `worker-${index + 1}`,
    }));

    expect(classifyMissingWorkflowApproval(projection)).toBe(
      "request_required",
    );
  });

  it("does not let root fallback prose impersonate missing subagents", () => {
    const projection = completedProjection();
    projection.threads = projection.threads.slice(0, 1);
    projection.assistantText =
      "Surgeon unresolved packet. Insurance unresolved packet. Workflow approval pending.";

    expect(classifyMissingWorkflowApproval(projection)).toBe(
      "investigation_incomplete",
    );
    expect(failIncompleteInvestigation(projection).status).toBe("error");
  });

  it("prioritizes missing act structure over an attempted workflow", () => {
    const projection = completedProjection();
    projection.threads = projection.threads.slice(0, 1);
    projection.modelToolCalls = [
      {
        argumentsJson: "{}",
        functionName: "actions_run_trigger",
        index: 0,
        sourceEventId: "event-workflow",
        threadId: "thread-root",
        toolCallId: "call-workflow",
        toolInfo: null,
      },
    ];

    expect(classifyMissingWorkflowApproval(projection)).toBe(
      "investigation_incomplete",
    );
    expect(failIncompleteInvestigation(projection).status).toBe("error");
  });

  it("does not duplicate an observed workflow attempt", () => {
    const projection = completedProjection();
    projection.modelToolCalls = [
      {
        argumentsJson: JSON.stringify({
          inputs: { approval_nonce: workflowTarget.approvalNonce },
          method: "run_workflow",
          owner: workflowTarget.owner,
          ref: workflowTarget.ref,
          repo: workflowTarget.repo,
          workflow_id: workflowTarget.workflowId,
        }),
        functionName: "actions_run_trigger",
        index: 0,
        sourceEventId: "event-workflow",
        threadId: "thread-insurance",
        toolCallId: "call-workflow",
        toolInfo: {
          type: "mcp",
          name: "actions_run_trigger",
          serverId: "github-server-id",
          serverName: "verdict-github",
        },
      },
    ];

    expect(shouldRequestMissingWorkflowApproval(projection)).toBe(false);
    expect(classifyMissingWorkflowApproval(projection)).toBe("attempt_failed");
    expect(failMissingWorkflowApprovalAttempt(projection)).toMatchObject({
      error:
        "Verdict attempted the workflow tool but completed without a TrueForge approval event.",
      status: "error",
    });
  });

  it("builds a host-owned corrective request with the exact target", () => {
    const message = buildWorkflowApprovalRequestMessage(workflowTarget);

    expect(message).toContain("invoke the actual actions_run_trigger tool once");
    expect(message).toContain("method run_workflow");
    expect(message).toContain("owner himanshu748");
    expect(message).toContain("repo verdict");
    expect(message).toContain("workflow_id verdict-day4-proof.yml");
    expect(message).toContain("ref main");
    expect(message).toContain(
      'inputs {"approval_nonce":"0123456789abcdef0123456789abcdef"}',
    );
  });

  it("resumes the exact completed turn and projects the approval event", async () => {
    const approvalRequired = {
      type: "tool.approval_required",
      id: "event-approval",
      createdAt: "2026-08-28T00:00:02.000Z",
      threadId: "thread-root",
      toolCalls: [{ id: "call-workflow", sourceEventId: "event-workflow" }],
    } satisfies TrueForgeApi.ToolApprovalRequiredEvent;
    const createTurnStream = vi.fn().mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield {
          type: "turn.created",
          id: "event-turn",
          createdAt: "2026-08-28T00:00:00.000Z",
          turnId: "turn-2",
          threadId: "thread-root",
          previousTurnId: "turn-1",
          state: { status: "running" },
        } satisfies TrueForgeApi.TurnCreatedEvent;
        yield {
          type: "model.message",
          id: "event-workflow",
          createdAt: "2026-08-28T00:00:01.000Z",
          threadId: "thread-root",
          content: null,
          toolCalls: [
            {
              type: "function",
              id: "call-workflow",
              function: {
                name: "actions_run_trigger",
                arguments: JSON.stringify({
                  inputs: { approval_nonce: workflowTarget.approvalNonce },
                  method: "run_workflow",
                  owner: workflowTarget.owner,
                  ref: workflowTarget.ref,
                  repo: workflowTarget.repo,
                  workflow_id: workflowTarget.workflowId,
                }),
              },
              toolInfo: {
                type: "mcp",
                name: "actions_run_trigger",
                serverId: "github-server-id",
                serverName: "verdict-github",
              },
            },
          ],
        } satisfies TrueForgeApi.ModelMessageEvent;
        yield approvalRequired;
        yield {
          type: "turn.done",
          id: "event-done",
          createdAt: "2026-08-28T00:00:03.000Z",
          threadId: "thread-root",
          state: {
            status: "done",
            completedAt: "2026-08-28T00:00:03.000Z",
            output: null,
            requiredActions: [approvalRequired],
          },
        } satisfies TrueForgeApi.TurnDoneEvent;
      },
    });
    const { cancel, client } = createClient(createTurnStream);

    const result = await requestMissingWorkflowApproval(
      client,
      completedProjection(),
      workflowTarget,
    );

    expect(result.status).toBe("approval_required");
    expect(result.pendingApprovals).toHaveLength(1);
    expect(createTurnStream).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ previousTurnId: "turn-1" }),
      expect.objectContaining({ maxRetries: 0 }),
    );
    expect(cancel).not.toHaveBeenCalled();
  });

  it("fails closed when the corrective turn returns only prose", async () => {
    const createTurnStream = vi.fn().mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield {
          type: "turn.done",
          id: "event-done",
          createdAt: "2026-08-28T00:00:01.000Z",
          threadId: "thread-root",
          state: {
            status: "done",
            completedAt: "2026-08-28T00:00:01.000Z",
            output: {
              type: "model.message",
              id: "event-message",
              createdAt: "2026-08-28T00:00:00.500Z",
              threadId: "thread-root",
              content: "I propose the workflow.",
            },
            requiredActions: [],
          },
        } satisfies TrueForgeApi.TurnDoneEvent;
      },
    });
    const { client } = createClient(createTurnStream);

    await expect(
      requestMissingWorkflowApproval(
        client,
        completedProjection(),
        workflowTarget,
      ),
    ).resolves.toMatchObject({
      error:
        "Verdict completed its corrective turn without invoking the approval-gated workflow tool.",
      status: "error",
    });
  });

  it("cancels a corrective turn that stalls before requesting approval", async () => {
    vi.useFakeTimers();
    const createTurnStream = vi.fn(
      async (
        _sessionId: string,
        _request: unknown,
        requestOptions: { abortSignal?: AbortSignal },
      ) => ({
        [Symbol.asyncIterator]() {
          return {
            next: () =>
              new Promise<IteratorResult<TrueForgeApi.TurnStreamingEvent>>(
                (_resolve, reject) => {
                  requestOptions.abortSignal?.addEventListener(
                    "abort",
                    () => reject(new Error("The operation was aborted")),
                    { once: true },
                  );
                },
              ),
          };
        },
      }),
    );
    const { cancel, client } = createClient(createTurnStream);
    const result = expect(
      requestMissingWorkflowApproval(
        client,
        completedProjection(),
        workflowTarget,
      ),
    ).rejects.toThrow(
      "Corrective workflow request stalled before reaching a terminal paused turn.",
    );

    await vi.advanceTimersByTimeAsync(VERDICT_WORKFLOW_REQUEST_TIMEOUT_MS);
    await result;
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("keeps the watchdog active after an approval event until the stream ends", async () => {
    vi.useFakeTimers();
    const approvalRequired = {
      type: "tool.approval_required",
      id: "event-approval-stalled",
      createdAt: "2026-08-28T00:00:01.000Z",
      threadId: "thread-root",
      toolCalls: [{ id: "call-workflow", sourceEventId: "event-workflow" }],
    } satisfies TrueForgeApi.ToolApprovalRequiredEvent;
    const createTurnStream = vi.fn(
      async (
        _sessionId: string,
        _request: unknown,
        requestOptions: { abortSignal?: AbortSignal },
      ) => ({
        [Symbol.asyncIterator]() {
          let emittedApproval = false;
          return {
            next: async () => {
              if (!emittedApproval) {
                emittedApproval = true;
                return { done: false as const, value: approvalRequired };
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
    const onProjection = vi.fn();
    const result = expect(
      requestMissingWorkflowApproval(
        client,
        completedProjection(),
        workflowTarget,
        onProjection,
      ),
    ).rejects.toThrow(
      "Corrective workflow request stalled before reaching a terminal paused turn.",
    );

    await vi.advanceTimersByTimeAsync(VERDICT_WORKFLOW_REQUEST_TIMEOUT_MS);
    await result;
    expect(onProjection).toHaveBeenCalledWith(
      expect.objectContaining({ status: "approval_required" }),
      approvalRequired,
    );
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
