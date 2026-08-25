import type { TrueForgeApi } from "@truefoundry/trueforge-sdk";
import { describe, expect, it } from "vitest";
import {
  createVerdictProjection,
  projectTurnEvent,
} from "../src/session.js";

const approvalRequired = {
  type: "tool.approval_required",
  id: "event-approval",
  createdAt: "2026-08-25T00:00:01.000Z",
  threadId: "thread-root",
  toolCalls: [{ id: "call-workflow", sourceEventId: "event-message" }],
} satisfies TrueForgeApi.ToolApprovalRequiredEvent;

describe("turn event projection", () => {
  it("projects dynamic thread creation from observed events", () => {
    const projection = projectTurnEvent(createVerdictProjection("session-1"), {
      type: "thread.created",
      id: "event-thread",
      createdAt: "2026-08-25T00:00:00.000Z",
      threadId: "thread-hunter",
      title: "Bounded reproduction matrix",
      parent: { threadId: "thread-root", toolCallId: "spawn-1" },
      agentInfo: {
        type: "dynamic",
        name: "Hunter",
        input: "Test at most eight condition cells.",
      },
    });

    expect(projection.threads).toEqual([
      {
        name: "Hunter",
        status: "running",
        threadId: "thread-hunter",
        title: "Bounded reproduction matrix",
      },
    ]);
  });

  it("keeps a completed turn paused when approvals are pending", () => {
    let projection = projectTurnEvent(createVerdictProjection("session-1"), {
      type: "turn.created",
      id: "event-turn",
      createdAt: "2026-08-25T00:00:00.000Z",
      turnId: "turn-1",
      threadId: "thread-root",
      previousTurnId: null,
      state: { status: "running" },
    });
    projection = projectTurnEvent(projection, approvalRequired);
    projection = projectTurnEvent(projection, {
      type: "turn.done",
      id: "event-done",
      createdAt: "2026-08-25T00:00:02.000Z",
      threadId: "thread-root",
      state: {
        status: "done",
        completedAt: "2026-08-25T00:00:02.000Z",
        output: null,
        requiredActions: [approvalRequired],
      },
    });

    expect(projection.status).toBe("approval_required");
    expect(projection.pendingApprovals).toEqual([
      {
        sourceEventId: "event-message",
        threadId: "thread-root",
        toolCallId: "call-workflow",
      },
    ]);
  });
});
