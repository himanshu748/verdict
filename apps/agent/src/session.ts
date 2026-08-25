import type { TrueForge, TrueForgeApi } from "@truefoundry/trueforge-sdk";
import { VERDICT_AGENT_NAME } from "./policy.js";

export type VerdictTurnStatus =
  | "idle"
  | "running"
  | "approval_required"
  | "action_required"
  | "done"
  | "cancelled"
  | "error";

export interface InvestigationTarget {
  issueNumber: number;
  repository: string;
}

export interface PendingApproval {
  sourceEventId: string;
  threadId: string;
  toolCallId: string;
}

export interface DynamicThreadProjection {
  name: string;
  status: "running" | "done" | "error";
  threadId: string;
  title: string;
}

export interface VerdictEventProjection {
  assistantText: string;
  error: string | null;
  pendingApprovals: PendingApproval[];
  sessionId: string;
  status: VerdictTurnStatus;
  threads: DynamicThreadProjection[];
  turnId: string | null;
}

export interface ApprovalChoice {
  decision: "allow" | "deny";
  reason?: string;
  threadId: string;
  toolCallId: string;
}

export type ProjectionListener = (
  projection: VerdictEventProjection,
  event: TrueForgeApi.TurnStreamingEvent,
) => void | Promise<void>;

export function createVerdictProjection(sessionId: string): VerdictEventProjection {
  return {
    assistantText: "",
    error: null,
    pendingApprovals: [],
    sessionId,
    status: "idle",
    threads: [],
    turnId: null,
  };
}

function contentToText(
  content: TrueForgeApi.ModelMessageEvent["content"],
): string {
  if (typeof content === "string") {
    return content;
  }

  if (!content) {
    return "";
  }

  return content
    .map((part) => (part.type === "text" ? part.text : part.refusal))
    .join("");
}

function upsertThread(
  threads: DynamicThreadProjection[],
  incoming: DynamicThreadProjection,
): DynamicThreadProjection[] {
  const index = threads.findIndex((thread) => thread.threadId === incoming.threadId);

  if (index === -1) {
    return [...threads, incoming];
  }

  return threads.map((thread, threadIndex) =>
    threadIndex === index ? incoming : thread,
  );
}

function appendUniqueApprovals(
  current: PendingApproval[],
  event: TrueForgeApi.ToolApprovalRequiredEvent,
): PendingApproval[] {
  const byKey = new Map(
    current.map((approval) => [
      `${approval.threadId}:${approval.toolCallId}`,
      approval,
    ]),
  );

  for (const toolCall of event.toolCalls) {
    const approval = {
      sourceEventId: toolCall.sourceEventId,
      threadId: event.threadId,
      toolCallId: toolCall.id,
    };
    byKey.set(`${approval.threadId}:${approval.toolCallId}`, approval);
  }

  return [...byKey.values()];
}

export function projectTurnEvent(
  projection: VerdictEventProjection,
  event: TrueForgeApi.TurnStreamingEvent,
): VerdictEventProjection {
  switch (event.type) {
    case "turn.created":
      return {
        ...projection,
        error: null,
        pendingApprovals: [],
        status: "running",
        turnId: event.turnId,
      };
    case "thread.created":
      return {
        ...projection,
        threads: upsertThread(projection.threads, {
          name: event.agentInfo.name,
          status: "running",
          threadId: event.threadId,
          title: event.title,
        }),
      };
    case "thread.done": {
      const existing = projection.threads.find(
        (thread) => thread.threadId === event.threadId,
      );
      return {
        ...projection,
        threads: upsertThread(projection.threads, {
          name: existing?.name ?? event.title,
          status: event.state.status === "error" ? "error" : "done",
          threadId: event.threadId,
          title: event.title,
        }),
      };
    }
    case "model.message.delta":
      return {
        ...projection,
        assistantText: `${projection.assistantText}${event.content ?? ""}`,
      };
    case "model.message": {
      const text = contentToText(event.content);
      return text ? { ...projection, assistantText: text } : projection;
    }
    case "tool.approval_required":
      return {
        ...projection,
        pendingApprovals: appendUniqueApprovals(
          projection.pendingApprovals,
          event,
        ),
        status: "approval_required",
      };
    case "mcp.auth_required":
      return {
        ...projection,
        error: "The configured MCP connector requires authorization.",
        status: "action_required",
      };
    case "turn.done": {
      if (event.state.status === "error") {
        return { ...projection, error: event.state.message, status: "error" };
      }

      if (event.state.status === "cancelled") {
        return { ...projection, status: "cancelled" };
      }

      const approvalEvents = event.state.requiredActions.filter(
        (action): action is TrueForgeApi.ToolApprovalRequiredEvent =>
          action.type === "tool.approval_required",
      );
      const pendingApprovals = approvalEvents.reduce(
        (approvals, action) => appendUniqueApprovals(approvals, action),
        projection.pendingApprovals,
      );
      const otherRequiredAction = event.state.requiredActions.find(
        (action) => action.type !== "tool.approval_required",
      );

      return {
        ...projection,
        assistantText:
          contentToText(event.state.output?.content) || projection.assistantText,
        error:
          otherRequiredAction?.type === "mcp.auth_required"
            ? "The configured MCP connector requires authorization."
            : otherRequiredAction?.type === "tool.response_required"
              ? "The turn requires a client-provided tool response."
              : projection.error,
        pendingApprovals,
        status:
          pendingApprovals.length > 0
            ? "approval_required"
            : otherRequiredAction
              ? "action_required"
              : "done",
      };
    }
    case "mcp.initialize":
    case "sandbox.created":
    case "tool.response":
    case "tool.response_required":
      return projection;
  }
}

function approvalKey(approval: {
  threadId: string;
  toolCallId: string;
}): string {
  return `${approval.threadId}:${approval.toolCallId}`;
}

export function buildApprovalBatch(
  pending: readonly PendingApproval[],
  choices: readonly ApprovalChoice[],
): TrueForgeApi.UserToolApprovalEvent[] {
  if (pending.length === 0) {
    throw new Error("There are no pending tool approvals to resume.");
  }

  const pendingKeys = new Set(pending.map(approvalKey));
  if (pendingKeys.size !== pending.length) {
    throw new Error("Pending tool approvals contain duplicates.");
  }

  const choicesByKey = new Map<string, ApprovalChoice>();
  for (const choice of choices) {
    const key = approvalKey(choice);
    if (!pendingKeys.has(key)) {
      throw new Error(`Approval choice does not match a pending tool call: ${key}`);
    }
    if (choicesByKey.has(key)) {
      throw new Error(`Approval choice is duplicated: ${key}`);
    }
    choicesByKey.set(key, choice);
  }

  if (choicesByKey.size !== pending.length) {
    throw new Error("Every pending tool call must receive one decision in the batch.");
  }

  return pending.map((approval) => {
    const choice = choicesByKey.get(approvalKey(approval));
    if (!choice) {
      throw new Error("Approval batch validation failed.");
    }

    return {
      type: "user.tool_approval",
      threadId: approval.threadId,
      toolCallId: approval.toolCallId,
      approval:
        choice.decision === "allow"
          ? { status: "allow" }
          : {
              status: "deny",
              ...(choice.reason ? { reason: choice.reason } : {}),
            },
    };
  });
}

export function allowAllPending(
  pending: readonly PendingApproval[],
): TrueForgeApi.UserToolApprovalEvent[] {
  return buildApprovalBatch(
    pending,
    pending.map((approval) => ({ ...approval, decision: "allow" as const })),
  );
}

export function denyAllPending(
  pending: readonly PendingApproval[],
  reason: string,
): TrueForgeApi.UserToolApprovalEvent[] {
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new Error("A denial reason is required.");
  }

  return buildApprovalBatch(
    pending,
    pending.map((approval) => ({
      ...approval,
      decision: "deny" as const,
      reason: trimmedReason,
    })),
  );
}

export async function consumeTurnStream(
  stream: AsyncIterable<TrueForgeApi.TurnStreamingEvent>,
  initial: VerdictEventProjection,
  onProjection?: ProjectionListener,
): Promise<VerdictEventProjection> {
  let projection = initial;

  for await (const event of stream) {
    projection = projectTurnEvent(projection, event);
    await onProjection?.(projection, event);
  }

  return projection;
}

export async function streamVerdictTurn(
  client: TrueForge,
  sessionId: string,
  input: TrueForgeApi.TurnInputItem[],
  initial: VerdictEventProjection = createVerdictProjection(sessionId),
  onProjection?: ProjectionListener,
): Promise<VerdictEventProjection> {
  const stream = await client.sessions.createTurnStream(sessionId, {
    input,
    previousTurnId: "auto",
  });

  return consumeTurnStream(stream, initial, onProjection);
}

export function buildInvestigationMessage(target: InvestigationTarget): string {
  const repository = target.repository.trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("repository must use the owner/name format.");
  }
  if (!Number.isSafeInteger(target.issueNumber) || target.issueNumber < 1) {
    throw new Error("issueNumber must be a positive integer.");
  }

  return `Investigate GitHub issue ${repository}#${target.issueNumber}. Execute Hunter, Surgeon and Insurance in order. Keep observations tied to GitHub evidence and stop at each act's evidence boundary.`;
}

export async function startVerdictInvestigation(
  client: TrueForge,
  target: InvestigationTarget,
  onProjection?: ProjectionListener,
): Promise<VerdictEventProjection> {
  const response = await client.sessions.create({
    agent: { name: VERDICT_AGENT_NAME },
  });
  const projection = createVerdictProjection(response.data.id);

  return streamVerdictTurn(
    client,
    response.data.id,
    [{ type: "user.message", content: buildInvestigationMessage(target) }],
    projection,
    onProjection,
  );
}

export async function resumeVerdictApprovals(
  client: TrueForge,
  projection: VerdictEventProjection,
  choices: readonly ApprovalChoice[],
  onProjection?: ProjectionListener,
): Promise<VerdictEventProjection> {
  const input = buildApprovalBatch(projection.pendingApprovals, choices);
  return streamVerdictTurn(
    client,
    projection.sessionId,
    input,
    { ...projection, pendingApprovals: [], status: "running" },
    onProjection,
  );
}

export async function allowVerdictApprovals(
  client: TrueForge,
  projection: VerdictEventProjection,
  onProjection?: ProjectionListener,
): Promise<VerdictEventProjection> {
  return streamVerdictTurn(
    client,
    projection.sessionId,
    allowAllPending(projection.pendingApprovals),
    { ...projection, pendingApprovals: [], status: "running" },
    onProjection,
  );
}

export async function denyVerdictApprovals(
  client: TrueForge,
  projection: VerdictEventProjection,
  reason: string,
  onProjection?: ProjectionListener,
): Promise<VerdictEventProjection> {
  return streamVerdictTurn(
    client,
    projection.sessionId,
    denyAllPending(projection.pendingApprovals, reason),
    { ...projection, pendingApprovals: [], status: "running" },
    onProjection,
  );
}
