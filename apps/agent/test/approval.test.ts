import type { TrueForge, TrueForgeApi } from "@truefoundry/trueforge-sdk";
import { describe, expect, it } from "vitest";
import { GITHUB_MCP_NAME } from "../src/policy.js";
import {
  approveVerdictWorkflow,
  buildInvestigationMessage,
  buildWorkflowApprovalBatch,
  createVerdictProjection,
  denyVerdictApprovals,
  denyAllPending,
  projectTurnEvent,
  type PendingApproval,
  type VerdictEventProjection,
  type WorkflowDispatchTarget,
} from "../src/session.js";

const trustedTarget: WorkflowDispatchTarget = {
  approvalNonce: "0123456789abcdef0123456789abcdef",
  owner: "himanshu748",
  ref: "main",
  repo: "verdict",
  workflowId: "verdict-investigation.yml",
};

const validArguments = {
  inputs: { approval_nonce: trustedTarget.approvalNonce },
  method: "run_workflow",
  owner: trustedTarget.owner,
  ref: trustedTarget.ref,
  repo: trustedTarget.repo,
  workflow_id: trustedTarget.workflowId,
};

interface ApprovalProjectionOptions {
  approvalSourceEventId?: string;
  approvalToolCallId?: string;
  argumentsJson?: string;
  functionName?: string;
  sourceEventId?: string;
  toolCallId?: string;
  toolInfoName?: string;
  toolServerName?: string;
  turnId?: string;
}

function createApprovalProjection(
  options: ApprovalProjectionOptions = {},
): VerdictEventProjection {
  const sourceEventId = options.sourceEventId ?? "event-message";
  const toolCallId = options.toolCallId ?? "call-workflow";
  let projection = projectTurnEvent(createVerdictProjection("session-1"), {
    type: "turn.created",
    id: "event-turn",
    createdAt: "2026-08-26T00:00:00.000Z",
    turnId: options.turnId ?? "turn-paused",
    threadId: "thread-root",
    previousTurnId: null,
    state: { status: "running" },
  } satisfies TrueForgeApi.TurnCreatedEvent);

  projection = projectTurnEvent(projection, {
    type: "model.message",
    id: sourceEventId,
    createdAt: "2026-08-26T00:00:00.000Z",
    threadId: "thread-root",
    content: null,
    toolCalls: [
      {
        type: "function",
        id: toolCallId,
        function: {
          name: options.functionName ?? "actions_run_trigger",
          arguments: options.argumentsJson ?? JSON.stringify(validArguments),
        },
        toolInfo: {
          type: "mcp",
          name: options.toolInfoName ?? "actions_run_trigger",
          serverId: "server-github",
          serverName: options.toolServerName ?? GITHUB_MCP_NAME,
        },
      },
    ],
  } satisfies TrueForgeApi.ModelMessageEvent);

  projection = projectTurnEvent(projection, {
    type: "tool.approval_required",
    id: "event-approval",
    createdAt: "2026-08-26T00:00:01.000Z",
    threadId: "thread-root",
    toolCalls: [
      {
        id: options.approvalToolCallId ?? toolCallId,
        sourceEventId: options.approvalSourceEventId ?? sourceEventId,
      },
    ],
  } satisfies TrueForgeApi.ToolApprovalRequiredEvent);

  return projection;
}

interface CapturedTurnRequest {
  input: TrueForgeApi.TurnInputItem[];
  previousTurnId: string;
  requestOptions: { maxRetries?: number } | undefined;
}

function createCapturingClient(requests: CapturedTurnRequest[]): TrueForge {
  return {
    sessions: {
      createTurnStream: async (
        _sessionId: string,
        request: { input: TrueForgeApi.TurnInputItem[]; previousTurnId: string },
        requestOptions?: { maxRetries?: number },
      ) => {
        requests.push({ ...request, requestOptions });
        return (async function* emptyStream() {})();
      },
    },
  } as unknown as TrueForge;
}

describe("workflow approval policy", () => {
  it("allows only the exact workflow dispatch and approval nonce", () => {
    const projection = createApprovalProjection();

    expect(buildWorkflowApprovalBatch(projection, trustedTarget)).toEqual([
      {
        type: "user.tool_approval",
        threadId: "thread-root",
        toolCallId: "call-workflow",
        approval: { status: "allow" },
      },
    ]);
  });

  it.each(["cancel_workflow_run", "delete_workflow_run", "rerun_workflow"])(
    "rejects destructive or unsupported method %s",
    (method) => {
      const projection = createApprovalProjection({
        argumentsJson: JSON.stringify({ ...validArguments, method }),
      });

      expect(() =>
        buildWorkflowApprovalBatch(projection, trustedTarget),
      ).toThrow("Workflow method must be run_workflow");
    },
  );

  it.each([
    ["owner", "another-owner"],
    ["repo", "another-repo"],
    ["workflow_id", "another-workflow.yml"],
    ["ref", "another-ref"],
  ])("rejects a mismatched trusted target field %s", (field, value) => {
    const projection = createApprovalProjection({
      argumentsJson: JSON.stringify({ ...validArguments, [field]: value }),
    });

    expect(() => buildWorkflowApprovalBatch(projection, trustedTarget)).toThrow(
      `trusted target fields: ${field}`,
    );
  });

  it.each([{ run_id: 123 }, { extra: "not allowed" }])(
    "rejects extra workflow arguments %#",
    (extra) => {
      const projection = createApprovalProjection({
        argumentsJson: JSON.stringify({ ...validArguments, ...extra }),
      });

      expect(() =>
        buildWorkflowApprovalBatch(projection, trustedTarget),
      ).toThrow("forbidden fields");
    },
  );

  it.each([
    undefined,
    null,
    [],
    {},
    { issue: "417" },
    { approval_nonce: "another-nonce" },
    {
      approval_nonce: trustedTarget.approvalNonce,
      extra: "not allowed",
    },
  ])(
    "rejects missing, mismatched or malformed workflow inputs %j",
    (inputs) => {
      const args = { ...validArguments } as Record<string, unknown>;
      if (inputs === undefined) {
        delete args.inputs;
      } else {
        args.inputs = inputs;
      }
      const projection = createApprovalProjection({
        argumentsJson: JSON.stringify(args),
      });

      expect(() =>
        buildWorkflowApprovalBatch(projection, trustedTarget),
      ).toThrow();
    },
  );

  it("rejects a model nonce that does not match the host target", () => {
    const projection = createApprovalProjection({
      argumentsJson: JSON.stringify({
        ...validArguments,
        inputs: { approval_nonce: "fedcba9876543210fedcba9876543210" },
      }),
    });

    expect(() => buildWorkflowApprovalBatch(projection, trustedTarget)).toThrow(
      "inputs.approval_nonce",
    );
  });

  it.each(["{not-json", "[]", "null"])(
    "rejects malformed or non-object arguments %s",
    (argumentsJson) => {
      const projection = createApprovalProjection({ argumentsJson });

      expect(() =>
        buildWorkflowApprovalBatch(projection, trustedTarget),
      ).toThrow();
    },
  );

  it("rejects approval references with a mismatched source event id", () => {
    const projection = createApprovalProjection({
      approvalSourceEventId: "event-not-the-origin",
    });

    expect(projection.pendingApprovals[0]?.toolCall).toBeNull();
    expect(() => buildWorkflowApprovalBatch(projection, trustedTarget)).toThrow(
      "does not resolve to exactly one originating model tool call",
    );
  });

  it("rejects approval references with a mismatched tool call id", () => {
    const projection = createApprovalProjection({
      approvalToolCallId: "call-not-the-origin",
    });

    expect(() => buildWorkflowApprovalBatch(projection, trustedTarget)).toThrow(
      "does not resolve to exactly one originating model tool call",
    );
  });

  it.each([
    { functionName: "delete_file" },
    { toolInfoName: "delete_file" },
    { toolServerName: "another-server" },
  ])("rejects a non-authorized tool identity %#", (options) => {
    const projection = createApprovalProjection(options);

    expect(() => buildWorkflowApprovalBatch(projection, trustedTarget)).toThrow(
      "Only the configured GitHub actions_run_trigger tool may be approved",
    );
  });

  it("rejects multiple pending approval calls", () => {
    const first = createApprovalProjection();
    const projection = projectTurnEvent(first, {
      type: "tool.approval_required",
      id: "event-approval-2",
      createdAt: "2026-08-26T00:00:02.000Z",
      threadId: "thread-root",
      toolCalls: [
        { id: "call-workflow-2", sourceEventId: "event-message" },
      ],
    });

    expect(() => buildWorkflowApprovalBatch(projection, trustedTarget)).toThrow(
      "Exactly one pending actions_run_trigger call",
    );
  });

  it("rejects more than one authoritative workflow call in the turn", () => {
    let projection = createApprovalProjection();
    projection = projectTurnEvent(projection, {
      type: "model.message",
      id: "event-message-2",
      createdAt: "2026-08-26T00:00:02.000Z",
      threadId: "thread-root",
      content: null,
      toolCalls: [
        {
          type: "function",
          id: "call-workflow-2",
          function: {
            name: "actions_run_trigger",
            arguments: JSON.stringify(validArguments),
          },
          toolInfo: {
            type: "mcp",
            name: "actions_run_trigger",
            serverId: "server-github",
            serverName: GITHUB_MCP_NAME,
          },
        },
      ],
    });

    expect(() => buildWorkflowApprovalBatch(projection, trustedTarget)).toThrow(
      "Exactly one authoritative actions_run_trigger",
    );
  });

  it("rejects tampered metadata attached to a pending approval", () => {
    const projection = createApprovalProjection();
    const approval = projection.pendingApprovals[0]!;
    projection.pendingApprovals = [
      {
        ...approval,
        toolCall: approval.toolCall
          ? { ...approval.toolCall, argumentsJson: "{}" }
          : null,
      },
    ];

    expect(() => buildWorkflowApprovalBatch(projection, trustedTarget)).toThrow(
      "metadata does not match its originating model event",
    );
  });

  it("rejects malformed trusted target values", () => {
    expect(() =>
      buildWorkflowApprovalBatch(createApprovalProjection(), {
        ...trustedTarget,
        ref: " main ",
      }),
    ).toThrow("Trusted workflow target ref");
  });

  it("rejects a trusted proof target outside main", () => {
    expect(() =>
      buildWorkflowApprovalBatch(createApprovalProjection(), {
        ...trustedTarget,
        ref: "release",
      }),
    ).toThrow("main branch");
  });
});

describe("approval turn binding", () => {
  it("resumes an approved workflow from the exact paused turn", async () => {
    const requests: CapturedTurnRequest[] = [];
    const projection = createApprovalProjection();

    await approveVerdictWorkflow(
      createCapturingClient(requests),
      projection,
      trustedTarget,
    );

    expect(requests).toEqual([
      {
        input: [
          {
            type: "user.tool_approval",
            threadId: "thread-root",
            toolCallId: "call-workflow",
            approval: { status: "allow" },
          },
        ],
        previousTurnId: "turn-paused",
        requestOptions: { maxRetries: 0 },
      },
    ]);
  });

  it("rejects approval when the projection is not paused", async () => {
    const projection = { ...createApprovalProjection(), status: "done" as const };

    await expect(
      approveVerdictWorkflow(
        createCapturingClient([]),
        projection,
        trustedTarget,
      ),
    ).rejects.toThrow("approval_required");
  });

  it("rejects approval when the paused turn id is missing", async () => {
    const projection = { ...createApprovalProjection(), turnId: null };

    await expect(
      approveVerdictWorkflow(
        createCapturingClient([]),
        projection,
        trustedTarget,
      ),
    ).rejects.toThrow("paused turn id");
  });

  it("resumes a denial from the exact paused turn", async () => {
    const requests: CapturedTurnRequest[] = [];
    const projection = createApprovalProjection();

    await denyVerdictApprovals(
      createCapturingClient(requests),
      projection,
      "Maintainer denied the write.",
    );

    expect(requests[0]?.previousTurnId).toBe("turn-paused");
    expect(requests[0]?.requestOptions).toEqual({ maxRetries: 0 });
  });

  it("rejects denial when the projection is not paused", async () => {
    const projection = { ...createApprovalProjection(), status: "done" as const };

    await expect(
      denyVerdictApprovals(
        createCapturingClient([]),
        projection,
        "Maintainer denied the write.",
      ),
    ).rejects.toThrow("approval_required");
  });

  it("rejects denial when the paused turn id is missing", async () => {
    const projection = { ...createApprovalProjection(), turnId: null };

    await expect(
      denyVerdictApprovals(
        createCapturingClient([]),
        projection,
        "Maintainer denied the write.",
      ),
    ).rejects.toThrow("paused turn id");
  });
});

describe("trusted investigation handoff", () => {
  it("gives the model the exact host-owned workflow target", () => {
    const message = buildInvestigationMessage(
      { issueNumber: 417, repository: "truefoundry/trueforge" },
      {
        approvalNonce: "0123456789abcdef0123456789abcdef",
        owner: "himanshu748",
        repo: "verdict",
        workflowId: "verdict-day4-proof.yml",
        ref: "main",
      },
    );

    expect(message).toContain(
      "The only host-authorized write proposal is run_workflow for himanshu748/verdict, workflow verdict-day4-proof.yml, ref main, with approval_nonce 0123456789abcdef0123456789abcdef and no other inputs.",
    );
    expect(message).toContain(
      "An explicit unresolved result is a valid act completion",
    );
  });
});

describe("safe bulk denial", () => {
  const pending: PendingApproval[] = [
    {
      sourceEventId: "event-1",
      threadId: "thread-hunter",
      toolCall: null,
      toolCallId: "call-1",
    },
    {
      sourceEventId: "event-2",
      threadId: "thread-insurance",
      toolCall: null,
      toolCallId: "call-2",
    },
  ];

  it("denies every pending call even when its metadata is unresolved", () => {
    expect(denyAllPending(pending, "  Not authorized for this run.  ")).toEqual([
      {
        type: "user.tool_approval",
        threadId: "thread-hunter",
        toolCallId: "call-1",
        approval: { status: "deny", reason: "Not authorized for this run." },
      },
      {
        type: "user.tool_approval",
        threadId: "thread-insurance",
        toolCallId: "call-2",
        approval: { status: "deny", reason: "Not authorized for this run." },
      },
    ]);
  });

  it("rejects an empty denial reason", () => {
    expect(() => denyAllPending(pending, "   ")).toThrow(
      "A denial reason is required",
    );
  });

  it("rejects duplicate pending calls", () => {
    expect(() => denyAllPending([pending[0]!, pending[0]!], "Denied")).toThrow(
      "contain duplicates",
    );
  });

  it("rejects an empty pending set", () => {
    expect(() => denyAllPending([], "Denied")).toThrow(
      "There are no pending tool approvals to deny",
    );
  });
});
