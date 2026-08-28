import { randomBytes } from "node:crypto";
import type {
  BaseRequestOptions,
  TrueForge,
  TrueForgeApi,
} from "@truefoundry/trueforge-sdk";
import { GITHUB_MCP_NAME, VERDICT_AGENT_NAME } from "./policy.js";
import {
  buildSourceBootstrapCommand,
  VERDICT_NODE_BINARY,
  VERDICT_SOURCE_DIR,
} from "./source-bootstrap.js";
import { resolveTrustedSourceManifest } from "./source-manifest.js";

export type VerdictTurnStatus =
  | "idle"
  | "running"
  | "approval_required"
  | "action_required"
  | "done"
  | "cancelled"
  | "error";

export const VERDICT_HUNTER_START_TIMEOUT_MS = 120_000;
export const VERDICT_WORKFLOW_REQUEST_TIMEOUT_MS = 60_000;

export type MissingWorkflowApprovalState =
  | "not_applicable"
  | "request_required"
  | "attempt_failed";

export interface InvestigationTarget {
  issueNumber: number;
  repository: string;
  sourceManifestId: string;
}

export interface VerdictRunConfig {
  investigationTarget: InvestigationTarget;
  workflowTarget: WorkflowDispatchTarget;
}

export interface PendingApproval {
  sourceEventId: string;
  threadId: string;
  /**
   * Tool metadata copied from the referenced model.message event. A null value
   * means the approval reference could not be resolved and must never be
   * approved. The model event remains the authority, not approval UI input.
   */
  toolCall: ModelToolCallMetadata | null;
  toolCallId: string;
}

export interface ModelToolCallMetadata {
  argumentsJson: string;
  functionName: string | null;
  index: number;
  sourceEventId: string;
  threadId: string;
  toolCallId: string | null;
  toolInfo: TrueForgeApi.ToolInfo | null;
}

export interface DynamicThreadProjection {
  name: string;
  status: "running" | "done" | "cancelled" | "error";
  threadId: string;
  title: string;
}

export interface VerdictEventProjection {
  assistantText: string;
  error: string | null;
  modelToolCalls: ModelToolCallMetadata[];
  pendingApprovals: PendingApproval[];
  sessionId: string;
  status: VerdictTurnStatus;
  threads: DynamicThreadProjection[];
  turnId: string | null;
}

/**
 * Trusted host policy for the sole workflow dispatch Verdict may approve.
 * Values must come from application configuration or an equivalent trusted
 * boundary, never from model output, issue text or approval form fields.
 */
export interface WorkflowDispatchTarget {
  approvalNonce: string;
  owner: string;
  ref: string;
  repo: string;
  workflowId: string;
}

function requireEnvValue(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

export function buildVerdictRunConfig(
  env: NodeJS.ProcessEnv = process.env,
  createApprovalNonce: () => string = () => randomBytes(16).toString("hex"),
): VerdictRunConfig {
  const issueNumberRaw = requireEnvValue(env, "VERDICT_ISSUE_NUMBER");
  const issueNumber = Number(issueNumberRaw);
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) {
    throw new Error("VERDICT_ISSUE_NUMBER must be a positive integer.");
  }

  const sourceManifestId = requireEnvValue(
    env,
    "VERDICT_SOURCE_MANIFEST_ID",
  );
  const sourceManifest = resolveTrustedSourceManifest(sourceManifestId);
  const repository = requireEnvValue(env, "VERDICT_ISSUE_REPOSITORY");
  if (repository !== sourceManifest.repository) {
    throw new Error(
      "VERDICT_ISSUE_REPOSITORY must match the trusted source manifest.",
    );
  }
  if (issueNumber !== sourceManifest.issueNumber) {
    throw new Error(
      "VERDICT_ISSUE_NUMBER must match the trusted source manifest.",
    );
  }

  const investigationTarget = {
    issueNumber,
    repository,
    sourceManifestId: sourceManifest.id,
  };
  const workflowRef = requireEnvValue(env, "VERDICT_WORKFLOW_REF");
  if (workflowRef !== "main") {
    throw new Error("VERDICT_WORKFLOW_REF must be main for the proof workflow.");
  }
  const workflowTarget = assertTrustedWorkflowTarget({
    approvalNonce: createApprovalNonce(),
    owner: requireEnvValue(env, "VERDICT_WORKFLOW_OWNER"),
    ref: workflowRef,
    repo: requireEnvValue(env, "VERDICT_WORKFLOW_REPO"),
    workflowId: requireEnvValue(env, "VERDICT_WORKFLOW_ID"),
  });

  buildInvestigationMessage(investigationTarget, workflowTarget);
  return { investigationTarget, workflowTarget };
}

export function parseVerdictDecision(input: string): "approve" | "deny" {
  const decision = input.trim();
  if (decision === "APPROVE VERDICT WORKFLOW") {
    return "approve";
  }
  if (decision === "DENY") {
    return "deny";
  }
  throw new Error(
    "Decision must be exactly APPROVE VERDICT WORKFLOW or DENY.",
  );
}

export type ProjectionListener = (
  projection: VerdictEventProjection,
  event: TrueForgeApi.TurnStreamingEvent,
) => void | Promise<void>;

export function createVerdictProjection(sessionId: string): VerdictEventProjection {
  return {
    assistantText: "",
    error: null,
    modelToolCalls: [],
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
  modelToolCalls: readonly ModelToolCallMetadata[],
): PendingApproval[] {
  const byKey = new Map(
    current.map((approval) => [
      `${approval.threadId}:${approval.toolCallId}`,
      approval,
    ]),
  );

  for (const toolCall of event.toolCalls) {
    const metadata = resolveModelToolCall(
      modelToolCalls,
      event.threadId,
      toolCall.sourceEventId,
      toolCall.id,
    );
    const approval = {
      sourceEventId: toolCall.sourceEventId,
      threadId: event.threadId,
      toolCall: metadata,
      toolCallId: toolCall.id,
    };
    byKey.set(`${approval.threadId}:${approval.toolCallId}`, approval);
  }

  return [...byKey.values()];
}

function cloneToolInfo(
  toolInfo: TrueForgeApi.ToolInfo | null,
): TrueForgeApi.ToolInfo | null {
  return toolInfo ? { ...toolInfo } : null;
}

function cloneModelToolCall(
  toolCall: ModelToolCallMetadata,
): ModelToolCallMetadata {
  return {
    ...toolCall,
    toolInfo: cloneToolInfo(toolCall.toolInfo),
  };
}

function resolveModelToolCall(
  modelToolCalls: readonly ModelToolCallMetadata[],
  threadId: string,
  sourceEventId: string,
  toolCallId: string,
): ModelToolCallMetadata | null {
  const matches = modelToolCalls.filter(
    (toolCall) =>
      toolCall.threadId === threadId &&
      toolCall.sourceEventId === sourceEventId &&
      toolCall.toolCallId === toolCallId,
  );

  return matches.length === 1 ? cloneModelToolCall(matches[0]!) : null;
}

function refreshPendingApprovalMetadata(
  pending: readonly PendingApproval[],
  modelToolCalls: readonly ModelToolCallMetadata[],
): PendingApproval[] {
  return pending.map((approval) => ({
    ...approval,
    toolCall: resolveModelToolCall(
      modelToolCalls,
      approval.threadId,
      approval.sourceEventId,
      approval.toolCallId,
    ),
  }));
}

function projectModelMessageToolCalls(
  current: readonly ModelToolCallMetadata[],
  event: TrueForgeApi.ModelMessageEvent,
): ModelToolCallMetadata[] {
  const retained = current.filter(
    (toolCall) =>
      toolCall.sourceEventId !== event.id || toolCall.threadId !== event.threadId,
  );
  const incoming = (event.toolCalls ?? []).map(
    (toolCall, index): ModelToolCallMetadata => ({
      argumentsJson: toolCall.function.arguments,
      functionName: toolCall.function.name,
      index,
      sourceEventId: event.id,
      threadId: event.threadId,
      toolCallId: toolCall.id,
      toolInfo: cloneToolInfo(toolCall.toolInfo),
    }),
  );

  return [...retained, ...incoming];
}

function projectModelMessageDeltaToolCalls(
  current: readonly ModelToolCallMetadata[],
  event: TrueForgeApi.ModelMessageDeltaEvent,
): ModelToolCallMetadata[] {
  let next = current.map(cloneModelToolCall);

  for (const delta of event.toolCalls ?? []) {
    const index = next.findIndex(
      (toolCall) =>
        toolCall.sourceEventId === event.id &&
        toolCall.threadId === event.threadId &&
        toolCall.index === delta.index,
    );
    const existing = index === -1 ? null : next[index]!;
    const merged: ModelToolCallMetadata = {
      argumentsJson: `${existing?.argumentsJson ?? ""}${delta.function?.arguments ?? ""}`,
      functionName: delta.function?.name ?? existing?.functionName ?? null,
      index: delta.index,
      sourceEventId: event.id,
      threadId: event.threadId,
      toolCallId: delta.id ?? existing?.toolCallId ?? null,
      toolInfo: cloneToolInfo(delta.toolInfo ?? existing?.toolInfo ?? null),
    };

    if (index === -1) {
      next = [...next, merged];
    } else {
      next[index] = merged;
    }
  }

  return next;
}

export function projectTurnEvent(
  projection: VerdictEventProjection,
  event: TrueForgeApi.TurnStreamingEvent,
): VerdictEventProjection {
  switch (event.type) {
    case "turn.created":
      return {
        ...projection,
        assistantText: "",
        error: null,
        modelToolCalls: [],
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
    case "model.message.delta": {
      const modelToolCalls = projectModelMessageDeltaToolCalls(
        projection.modelToolCalls,
        event,
      );
      return {
        ...projection,
        assistantText: `${projection.assistantText}${event.content ?? ""}`,
        modelToolCalls,
        pendingApprovals: refreshPendingApprovalMetadata(
          projection.pendingApprovals,
          modelToolCalls,
        ),
      };
    }
    case "model.message": {
      const text = contentToText(event.content);
      const modelToolCalls = projectModelMessageToolCalls(
        projection.modelToolCalls,
        event,
      );
      return {
        ...projection,
        ...(text ? { assistantText: text } : {}),
        modelToolCalls,
        pendingApprovals: refreshPendingApprovalMetadata(
          projection.pendingApprovals,
          modelToolCalls,
        ),
      };
    }
    case "tool.approval_required":
      return {
        ...projection,
        pendingApprovals: appendUniqueApprovals(
          projection.pendingApprovals,
          event,
          projection.modelToolCalls,
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
        (approvals, action) =>
          appendUniqueApprovals(
            approvals,
            action,
            projection.modelToolCalls,
          ),
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

const WORKFLOW_TOOL_NAME = "actions_run_trigger";
const WORKFLOW_METHOD = "run_workflow";
const TRUEFORGE_CALL_TOOL_NAME = "call_tool";
const REQUIRED_WORKFLOW_ARGUMENT_KEYS = [
  "inputs",
  "method",
  "owner",
  "ref",
  "repo",
  "workflow_id",
] as const;

interface WorkflowDispatchArguments {
  inputs: { approval_nonce: string };
  method: typeof WORKFLOW_METHOD;
  owner: string;
  ref: string;
  repo: string;
  workflow_id: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertTrustedWorkflowTarget(
  target: WorkflowDispatchTarget,
): WorkflowDispatchTarget {
  for (const [field, value] of Object.entries(target)) {
    if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
      throw new Error(
        `Trusted workflow target ${field} must be a non-empty, normalized string.`,
      );
    }
  }

  if (!/^[a-f0-9]{32}$/.test(target.approvalNonce)) {
    throw new Error(
      "Trusted workflow target approval nonce must be 32 lowercase hexadecimal characters.",
    );
  }
  if (target.ref !== "main") {
    throw new Error("Trusted workflow target must use the main branch.");
  }

  return target;
}

function parseWorkflowDispatchValue(parsed: unknown): WorkflowDispatchArguments {
  if (!isRecord(parsed)) {
    throw new Error("Workflow tool arguments must be a JSON object.");
  }

  const allowedKeys = new Set<string>([
    ...REQUIRED_WORKFLOW_ARGUMENT_KEYS,
  ]);
  const extraKeys = Object.keys(parsed).filter((key) => !allowedKeys.has(key));
  if (extraKeys.length > 0) {
    throw new Error(
      `Workflow tool arguments contain forbidden fields: ${extraKeys.join(", ")}.`,
    );
  }

  const missingKeys = REQUIRED_WORKFLOW_ARGUMENT_KEYS.filter(
    (key) => !Object.hasOwn(parsed, key),
  );
  if (missingKeys.length > 0) {
    throw new Error(
      `Workflow tool arguments are missing required fields: ${missingKeys.join(", ")}.`,
    );
  }

  if (parsed.method !== WORKFLOW_METHOD) {
    throw new Error(`Workflow method must be ${WORKFLOW_METHOD}.`);
  }

  for (const key of ["owner", "repo", "workflow_id", "ref"] as const) {
    if (typeof parsed[key] !== "string") {
      throw new Error(`Workflow argument ${key} must be a string.`);
    }
  }

  if (
    !isRecord(parsed.inputs) ||
    Object.keys(parsed.inputs).length !== 1 ||
    typeof parsed.inputs.approval_nonce !== "string" ||
    !/^[a-f0-9]{32}$/.test(parsed.inputs.approval_nonce)
  ) {
    throw new Error(
      "Workflow inputs must contain only a 32-character lowercase hexadecimal approval_nonce.",
    );
  }

  return {
    inputs: { approval_nonce: parsed.inputs.approval_nonce },
    method: WORKFLOW_METHOD,
    owner: parsed.owner as string,
    ref: parsed.ref as string,
    repo: parsed.repo as string,
    workflow_id: parsed.workflow_id as string,
  };
}

function parseWorkflowDispatchArguments(
  argumentsJson: string,
): WorkflowDispatchArguments {
  let parsed: unknown;
  try {
    parsed = JSON.parse(argumentsJson) as unknown;
  } catch {
    throw new Error("Workflow tool arguments must be valid JSON.");
  }

  return parseWorkflowDispatchValue(parsed);
}

function parseCallToolEnvelope(
  argumentsJson: string,
): WorkflowDispatchArguments {
  let parsed: unknown;
  try {
    parsed = JSON.parse(argumentsJson) as unknown;
  } catch {
    throw new Error("TrueForge call_tool arguments must be valid JSON.");
  }
  if (!isRecord(parsed)) {
    throw new Error("TrueForge call_tool arguments must be a JSON object.");
  }

  const requiredKeys = ["input", "mcp_server", "tool_name"] as const;
  const allowedKeys = new Set<string>(requiredKeys);
  const extraKeys = Object.keys(parsed).filter((key) => !allowedKeys.has(key));
  if (extraKeys.length > 0) {
    throw new Error(
      `TrueForge call_tool arguments contain forbidden fields: ${extraKeys.join(", ")}.`,
    );
  }
  const missingKeys = requiredKeys.filter((key) => !Object.hasOwn(parsed, key));
  if (missingKeys.length > 0) {
    throw new Error(
      `TrueForge call_tool arguments are missing required fields: ${missingKeys.join(", ")}.`,
    );
  }
  if (parsed.mcp_server !== GITHUB_MCP_NAME) {
    throw new Error(`TrueForge call_tool must use ${GITHUB_MCP_NAME}.`);
  }
  if (parsed.tool_name !== WORKFLOW_TOOL_NAME) {
    throw new Error(
      `TrueForge call_tool must use ${WORKFLOW_TOOL_NAME}.`,
    );
  }

  return parseWorkflowDispatchValue(parsed.input);
}

function isWorkflowToolCallCandidate(toolCall: ModelToolCallMetadata): boolean {
  if (
    toolCall.functionName === WORKFLOW_TOOL_NAME ||
    toolCall.toolInfo?.name === WORKFLOW_TOOL_NAME
  ) {
    return true;
  }
  if (
    toolCall.functionName !== TRUEFORGE_CALL_TOOL_NAME ||
    toolCall.toolInfo?.type !== "truefoundry-system" ||
    toolCall.toolInfo.name !== TRUEFORGE_CALL_TOOL_NAME
  ) {
    return false;
  }

  try {
    const parsed = JSON.parse(toolCall.argumentsJson) as unknown;
    return isRecord(parsed) && parsed.tool_name === WORKFLOW_TOOL_NAME;
  } catch {
    return false;
  }
}

function parseAuthorizedWorkflowToolCall(
  toolCall: ModelToolCallMetadata,
): WorkflowDispatchArguments {
  if (
    toolCall.functionName === WORKFLOW_TOOL_NAME &&
    toolCall.toolInfo?.type === "mcp" &&
    toolCall.toolInfo.name === WORKFLOW_TOOL_NAME &&
    toolCall.toolInfo.serverName === GITHUB_MCP_NAME
  ) {
    return parseWorkflowDispatchArguments(toolCall.argumentsJson);
  }

  if (
    toolCall.functionName === TRUEFORGE_CALL_TOOL_NAME &&
    toolCall.toolInfo?.type === "truefoundry-system" &&
    toolCall.toolInfo.name === TRUEFORGE_CALL_TOOL_NAME
  ) {
    return parseCallToolEnvelope(toolCall.argumentsJson);
  }

  throw new Error(
    "Only the configured GitHub actions_run_trigger tool may be approved.",
  );
}

function toolInfoMatches(
  left: TrueForgeApi.ToolInfo | null,
  right: TrueForgeApi.ToolInfo | null,
): boolean {
  if (left === null || right === null || left.type !== right.type) {
    return left === right;
  }

  if (left.type === "mcp" && right.type === "mcp") {
    return (
      left.name === right.name &&
      left.serverId === right.serverId &&
      left.serverName === right.serverName
    );
  }

  return left.name === right.name;
}

function pendingMetadataMatchesModelEvent(
  pending: PendingApproval,
  modelToolCall: ModelToolCallMetadata,
): boolean {
  const attached = pending.toolCall;
  return (
    attached !== null &&
    attached.argumentsJson === modelToolCall.argumentsJson &&
    attached.functionName === modelToolCall.functionName &&
    attached.index === modelToolCall.index &&
    attached.sourceEventId === pending.sourceEventId &&
    attached.sourceEventId === modelToolCall.sourceEventId &&
    attached.threadId === pending.threadId &&
    attached.threadId === modelToolCall.threadId &&
    attached.toolCallId === pending.toolCallId &&
    attached.toolCallId === modelToolCall.toolCallId &&
    toolInfoMatches(attached.toolInfo, modelToolCall.toolInfo)
  );
}

function resolveAuthoritativePendingToolCall(
  projection: VerdictEventProjection,
): { pending: PendingApproval; toolCall: ModelToolCallMetadata } {
  if (projection.pendingApprovals.length !== 1) {
    throw new Error(
      "Exactly one pending actions_run_trigger call is required for approval.",
    );
  }

  const pending = projection.pendingApprovals[0]!;
  const matches = projection.modelToolCalls.filter(
    (toolCall) =>
      toolCall.sourceEventId === pending.sourceEventId &&
      toolCall.threadId === pending.threadId &&
      toolCall.toolCallId === pending.toolCallId,
  );

  if (matches.length !== 1) {
    throw new Error(
      "Pending approval does not resolve to exactly one originating model tool call.",
    );
  }

  const toolCall = matches[0]!;
  if (!pendingMetadataMatchesModelEvent(pending, toolCall)) {
    throw new Error(
      "Pending approval metadata does not match its originating model event.",
    );
  }

  const workflowCalls = projection.modelToolCalls.filter(
    isWorkflowToolCallCandidate,
  );
  if (workflowCalls.length !== 1 || workflowCalls[0] !== toolCall) {
    throw new Error(
      "Exactly one authoritative actions_run_trigger model tool call is required.",
    );
  }

  return { pending, toolCall };
}

export function buildWorkflowApprovalBatch(
  projection: VerdictEventProjection,
  trustedTarget: WorkflowDispatchTarget,
): TrueForgeApi.UserToolApprovalEvent[] {
  const target = assertTrustedWorkflowTarget(trustedTarget);
  const { pending, toolCall } = resolveAuthoritativePendingToolCall(projection);

  const args = parseAuthorizedWorkflowToolCall(toolCall);
  const mismatches = [
    ["owner", args.owner, target.owner],
    ["repo", args.repo, target.repo],
    ["workflow_id", args.workflow_id, target.workflowId],
    ["ref", args.ref, target.ref],
    [
      "inputs.approval_nonce",
      args.inputs.approval_nonce,
      target.approvalNonce,
    ],
  ].filter(([, actual, expected]) => actual !== expected);

  if (mismatches.length > 0) {
    throw new Error(
      `Workflow dispatch does not match trusted target fields: ${mismatches
        .map(([field]) => field)
        .join(", ")}.`,
    );
  }

  return [
    {
      type: "user.tool_approval",
      threadId: pending.threadId,
      toolCallId: pending.toolCallId,
      approval: { status: "allow" },
    },
  ];
}

export function denyAllPending(
  pending: readonly PendingApproval[],
  reason: string,
): TrueForgeApi.UserToolApprovalEvent[] {
  if (pending.length === 0) {
    throw new Error("There are no pending tool approvals to deny.");
  }

  const pendingKeys = new Set(pending.map(approvalKey));
  if (pendingKeys.size !== pending.length) {
    throw new Error("Pending tool approvals contain duplicates.");
  }

  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new Error("A denial reason is required.");
  }

  return pending.map((approval) => ({
    type: "user.tool_approval",
    threadId: approval.threadId,
    toolCallId: approval.toolCallId,
    approval: { status: "deny", reason: trimmedReason },
  }));
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

async function streamVerdictTurn(
  client: TrueForge,
  sessionId: string,
  input: TrueForgeApi.TurnInputItem[],
  previousTurnId: string,
  initial: VerdictEventProjection = createVerdictProjection(sessionId),
  onProjection?: ProjectionListener,
  requestOptions?: Pick<
    BaseRequestOptions,
    "abortSignal" | "maxRetries" | "timeoutInSeconds"
  >,
): Promise<VerdictEventProjection> {
  const stream = await client.sessions.createTurnStream(
    sessionId,
    {
      input,
      previousTurnId,
    },
    requestOptions,
  );

  return consumeTurnStream(stream, initial, onProjection);
}

async function cancelSessionAfterStreamFailure(
  client: TrueForge,
  sessionId: string,
): Promise<void> {
  try {
    await client.sessions.cancel(
      sessionId,
      {},
      { maxRetries: 0, timeoutInSeconds: 10 },
    );
  } catch {
    // The turn may already be terminal or the local server may be unavailable.
  }
}

export function buildInvestigationMessage(
  target: InvestigationTarget,
  workflowTarget: WorkflowDispatchTarget,
): string {
  const repository = target.repository.trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("repository must use the owner/name format.");
  }
  if (!Number.isSafeInteger(target.issueNumber) || target.issueNumber < 1) {
    throw new Error("issueNumber must be a positive integer.");
  }
  const sourceManifest = resolveTrustedSourceManifest(target.sourceManifestId);
  if (repository !== sourceManifest.repository) {
    throw new Error("repository must match the trusted source manifest.");
  }
  if (target.issueNumber !== sourceManifest.issueNumber) {
    throw new Error("issueNumber must match the trusted source manifest.");
  }
  const bootstrapCommand = buildSourceBootstrapCommand(sourceManifest.id);
  const workflow = assertTrustedWorkflowTarget(workflowTarget);

  return `Investigate GitHub issue ${repository}#${target.issueNumber} at issue commit ${sourceManifest.issueCommit}. Execute Hunter, Surgeon and Insurance in order. Keep observations tied to GitHub evidence and stop at each act's evidence boundary. An explicit unresolved result is a valid act completion when required evidence is unavailable inside the configured research boundary. Trusted source manifest ${sourceManifest.id} executes ${sourceManifest.artifact.spec} with integrity ${sourceManifest.artifact.integrity}. Its npm SLSA provenance names commit ${sourceManifest.artifact.provenanceCommit}, which is not the issue commit. The vulnerable file ${sourceManifest.source.path} has the identical Git blob ${sourceManifest.source.blobSha1} at both commits. Do not claim that the full commits are identical or that the package was built from the issue commit. Hunter must treat this chain as unverified until the bootstrap succeeds. Hunter may execute this exact bootstrap command once and unchanged: <trusted_source_bootstrap>${bootstrapCommand}</trusted_source_bootstrap>. It verifies and installs the complete locked artifact closure without credentials in ${VERDICT_SOURCE_DIR}. Run reproduction code with ${VERDICT_NODE_BINARY} and cwd ${VERDICT_SOURCE_DIR}. The only host-authorized write proposal is run_workflow for ${workflow.owner}/${workflow.repo}, workflow ${workflow.workflowId}, ref ${workflow.ref}, with approval_nonce ${workflow.approvalNonce} and no other inputs. Request approval before dispatch and do not infer success from approval.`;
}

function requirePausedTurnId(projection: VerdictEventProjection): string {
  if (projection.status !== "approval_required") {
    throw new Error(
      "A workflow decision requires an approval_required projection.",
    );
  }
  if (!projection.turnId) {
    throw new Error("A workflow decision requires the exact paused turn id.");
  }

  return projection.turnId;
}

export async function startVerdictInvestigation(
  client: TrueForge,
  target: InvestigationTarget,
  workflowTarget: WorkflowDispatchTarget,
  onProjection?: ProjectionListener,
): Promise<VerdictEventProjection> {
  const response = await client.sessions.create(
    {
      agent: { name: VERDICT_AGENT_NAME },
    },
    { maxRetries: 0, timeoutInSeconds: 30 },
  );
  const projection = createVerdictProjection(response.data.id);
  const abortController = new AbortController();
  let observedHunter = false;
  const hunterStartTimer = setTimeout(
    () => abortController.abort(),
    VERDICT_HUNTER_START_TIMEOUT_MS,
  );

  try {
    return await streamVerdictTurn(
      client,
      response.data.id,
      [
        {
          type: "user.message",
          content: buildInvestigationMessage(target, workflowTarget),
        },
      ],
      "auto",
      projection,
      async (nextProjection, event) => {
        if (
          event.type === "thread.created" &&
          event.agentInfo.name === "Hunter" &&
          !observedHunter
        ) {
          observedHunter = true;
          clearTimeout(hunterStartTimer);
        }
        await onProjection?.(nextProjection, event);
      },
      { abortSignal: abortController.signal, maxRetries: 0 },
    );
  } catch (error) {
    await cancelSessionAfterStreamFailure(client, response.data.id);
    if (abortController.signal.aborted && !observedHunter) {
      throw new Error(
        "Provider stalled before creating the required Hunter subagent.",
        { cause: error },
      );
    }
    throw error;
  } finally {
    clearTimeout(hunterStartTimer);
  }
}

function completedActsAreOrdered(
  projection: VerdictEventProjection,
): boolean {
  let priorIndex = -1;
  return ["Hunter", "Surgeon", "Insurance"].every((name) => {
    const nextIndex = projection.threads.findIndex(
      (thread, index) =>
        index > priorIndex && thread.name === name && thread.status === "done",
    );
    priorIndex = nextIndex;
    return nextIndex !== -1;
  });
}

export function classifyMissingWorkflowApproval(
  projection: VerdictEventProjection,
): MissingWorkflowApprovalState {
  const orderedActsCompleted = completedActsAreOrdered(projection);
  const workflowAlreadyAttempted = projection.modelToolCalls.some(
    isWorkflowToolCallCandidate,
  );

  const applies =
    projection.status === "done" &&
    projection.pendingApprovals.length === 0 &&
    orderedActsCompleted;
  if (!applies) {
    return "not_applicable";
  }
  return workflowAlreadyAttempted ? "attempt_failed" : "request_required";
}

export function shouldRequestMissingWorkflowApproval(
  projection: VerdictEventProjection,
): boolean {
  return classifyMissingWorkflowApproval(projection) === "request_required";
}

export function failMissingWorkflowApprovalAttempt(
  projection: VerdictEventProjection,
): VerdictEventProjection {
  if (classifyMissingWorkflowApproval(projection) !== "attempt_failed") {
    throw new Error(
      "Only a completed workflow attempt without an approval event may be failed.",
    );
  }
  return {
    ...projection,
    error:
      "Verdict attempted the workflow tool but completed without a TrueForge approval event.",
    status: "error",
  };
}

export function buildWorkflowApprovalRequestMessage(
  trustedTarget: WorkflowDispatchTarget,
): string {
  const target = assertTrustedWorkflowTarget(trustedTarget);
  return `Insurance completed without emitting the required workflow approval event. In this response, state that the separate Verdict backend integration proof will run workflow ${target.workflowId} on ${target.owner}/${target.repo} at ref ${target.ref} with approval_nonce ${target.approvalNonce}, then immediately invoke the actual actions_run_trigger tool once. Use method run_workflow, owner ${target.owner}, repo ${target.repo}, workflow_id ${target.workflowId}, ref ${target.ref} and exactly inputs {"approval_nonce":"${target.approvalNonce}"}. Include no other inputs or arguments. Do not restate, quote, simulate or defer the tool call. Do not produce the final handoff before TrueForge pauses the actual invocation for human approval. This integration proof verifies Verdict's backend and does not reproduce or fix the source issue.`;
}

export async function requestMissingWorkflowApproval(
  client: TrueForge,
  projection: VerdictEventProjection,
  trustedTarget: WorkflowDispatchTarget,
  onProjection?: ProjectionListener,
): Promise<VerdictEventProjection> {
  if (!shouldRequestMissingWorkflowApproval(projection)) {
    throw new Error(
      "A corrective workflow request requires all three completed acts with no prior workflow attempt.",
    );
  }
  if (!projection.turnId) {
    throw new Error("A corrective workflow request requires a completed turn id.");
  }

  const abortController = new AbortController();
  const workflowRequestTimer = setTimeout(
    () => abortController.abort(),
    VERDICT_WORKFLOW_REQUEST_TIMEOUT_MS,
  );

  try {
    const next = await streamVerdictTurn(
      client,
      projection.sessionId,
      [
        {
          type: "user.message",
          content: buildWorkflowApprovalRequestMessage(trustedTarget),
        },
      ],
      projection.turnId,
      { ...projection, pendingApprovals: [], status: "running" },
      onProjection,
      { abortSignal: abortController.signal, maxRetries: 0 },
    );

    if (next.status === "approval_required") {
      return next;
    }

    return {
      ...next,
      error:
        next.error ??
        "Verdict completed its corrective turn without invoking the approval-gated workflow tool.",
      status: "error",
    };
  } catch (error) {
    await cancelSessionAfterStreamFailure(client, projection.sessionId);
    if (abortController.signal.aborted) {
      throw new Error(
        "Corrective workflow request stalled before reaching a terminal paused turn.",
        { cause: error },
      );
    }
    throw error;
  } finally {
    clearTimeout(workflowRequestTimer);
  }
}

export async function approveVerdictWorkflow(
  client: TrueForge,
  projection: VerdictEventProjection,
  trustedTarget: WorkflowDispatchTarget,
  onProjection?: ProjectionListener,
): Promise<VerdictEventProjection> {
  const pausedTurnId = requirePausedTurnId(projection);
  const input = buildWorkflowApprovalBatch(projection, trustedTarget);
  return streamVerdictTurn(
    client,
    projection.sessionId,
    input,
    pausedTurnId,
    { ...projection, pendingApprovals: [], status: "running" },
    onProjection,
    { maxRetries: 0 },
  );
}

export async function denyVerdictApprovals(
  client: TrueForge,
  projection: VerdictEventProjection,
  reason: string,
  _onProjection?: ProjectionListener,
): Promise<VerdictEventProjection> {
  const pausedTurnId = requirePausedTurnId(projection);
  const accumulatedText = projection.assistantText.trimEnd();
  const denialNotice =
    "The current workflow proposal was denied by the maintainer. This denial did not dispatch that proposal or create a draft pull request from it.";
  const deniedThreadIds = new Set(
    projection.pendingApprovals.map((approval) => approval.threadId),
  );
  const response = await client.sessions.createTurn(
    projection.sessionId,
    {
      input: denyAllPending(projection.pendingApprovals, reason),
      previousTurnId: pausedTurnId,
    },
    { maxRetries: 0 },
  );
  await client.sessions.cancel(projection.sessionId, {}, { maxRetries: 0 });

  return {
    ...projection,
    assistantText: accumulatedText
      ? `${accumulatedText}\n\n${denialNotice}`
      : denialNotice,
    error: null,
    modelToolCalls: [],
    pendingApprovals: [],
    status: "done",
    threads: projection.threads.map((thread) =>
      deniedThreadIds.has(thread.threadId) && thread.status === "running"
        ? { ...thread, status: "cancelled" }
        : thread,
    ),
    turnId: response.data.id,
  };
}
