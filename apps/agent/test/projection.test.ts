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
        toolCall: null,
        toolCallId: "call-workflow",
      },
    ]);
  });

  it("retains authoritative model tool-call metadata on a pending approval", () => {
    let projection = projectTurnEvent(createVerdictProjection("session-1"), {
      type: "model.message",
      id: "event-message",
      createdAt: "2026-08-25T00:00:00.000Z",
      threadId: "thread-root",
      content: null,
      toolCalls: [
        {
          type: "function",
          id: "call-workflow",
          function: {
            name: "actions_run_trigger",
            arguments:
              '{"method":"run_workflow","owner":"himanshu748","repo":"verdict","workflow_id":"demo.yml","ref":"main"}',
          },
          toolInfo: {
            type: "mcp",
            name: "actions_run_trigger",
            serverId: "github-server-id",
            serverName: "verdict-github",
          },
        },
      ],
    });
    projection = projectTurnEvent(projection, approvalRequired);

    expect(projection.pendingApprovals[0]?.toolCall).toEqual({
      argumentsJson:
        '{"method":"run_workflow","owner":"himanshu748","repo":"verdict","workflow_id":"demo.yml","ref":"main"}',
      functionName: "actions_run_trigger",
      index: 0,
      sourceEventId: "event-message",
      threadId: "thread-root",
      toolCallId: "call-workflow",
      toolInfo: {
        type: "mcp",
        name: "actions_run_trigger",
        serverId: "github-server-id",
        serverName: "verdict-github",
      },
    });
  });

  it("reconstructs streamed tool metadata and refreshes an earlier approval reference", () => {
    let projection = projectTurnEvent(createVerdictProjection("session-1"), {
      type: "model.message",
      id: "event-message",
      createdAt: "2026-08-25T00:00:00.000Z",
      threadId: "thread-root",
      content: null,
    });
    projection = projectTurnEvent(projection, approvalRequired);
    expect(projection.pendingApprovals[0]?.toolCall).toBeNull();

    projection = projectTurnEvent(projection, {
      type: "model.message.delta",
      id: "event-message",
      createdAt: "2026-08-25T00:00:01.100Z",
      threadId: "thread-root",
      toolCalls: [
        {
          index: 0,
          id: "call-workflow",
          type: "function",
          function: {
            name: "actions_run_trigger",
            arguments: '{"method":"run_',
          },
          toolInfo: {
            type: "mcp",
            name: "actions_run_trigger",
            serverId: "github-server-id",
            serverName: "verdict-github",
          },
        },
      ],
    });
    projection = projectTurnEvent(projection, {
      type: "model.message.delta",
      id: "event-message",
      createdAt: "2026-08-25T00:00:01.200Z",
      threadId: "thread-root",
      toolCalls: [
        {
          index: 0,
          function: { arguments: 'workflow","owner":"himanshu748"}' },
        },
      ],
    });

    expect(projection.pendingApprovals[0]?.toolCall).toMatchObject({
      argumentsJson: '{"method":"run_workflow","owner":"himanshu748"}',
      functionName: "actions_run_trigger",
      sourceEventId: "event-message",
      threadId: "thread-root",
      toolCallId: "call-workflow",
    });
  });
});
