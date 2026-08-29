import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  link,
  mkdir,
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";
import type { TrueForgeApi } from "@truefoundry/trueforge-sdk";
import {
  classifyReproduction,
  type ReproductionResult,
  type RunRecord,
} from "@verdict/protocol";
import {
  buildSourceBootstrapCommand,
  VERDICT_NODE_BINARY,
  VERDICT_REPRODUCTION_RUNNER,
  VERDICT_SOURCE_DIR,
} from "./source-bootstrap.js";
import { resolveTrustedSourceManifest } from "./source-manifest.js";
import type {
  InvestigationTarget,
  VerdictEventProjection,
} from "./session.js";

export const REPRODUCTION_OBSERVATION_BOUNDARY_MS = 1_000;
export const REPRODUCTION_REPETITIONS_PER_CONDITION = 10;

const REPRODUCTION_RUNNER_SOURCE = new URL(
  "../source-locks/trueforge-core-0.1.4/reproduce.mjs",
  import.meta.url,
);
const OBSERVATION_KIND = "verdict.reproduction-observations";
const RECORDED_KIND = "verdict.recorded-reproduction";
const STALLED_CONDITION = "daytona-stalled-endpoint";
const RESPONSIVE_CONDITION = "daytona-responsive-endpoint";

interface RunnerSourceOptions {
  observationBoundaryMs?: number;
  repetitionsPerCondition?: number;
}

interface RunnerObservation {
  durationMs: number;
  outputExcerpt: string;
  requestSeen: boolean;
  responseState: string | null;
  runId: string;
  settlement: "pending" | "resolved";
  startedAt: string;
}

interface RunnerCondition {
  conditionId: string;
  observations: RunnerObservation[];
}

interface RunnerEnvelope {
  conditions: RunnerCondition[];
  environment: Record<string, string>;
  issueCommit: string;
  kind: typeof OBSERVATION_KIND;
  observationBoundaryMs: number;
  package: string;
  provider: {
    className: "DaytonaSandboxProvider";
    module: "@truefoundry/trueforge-core/core";
  };
  schemaVersion: 1;
  sourceManifestId: string;
}

export interface RecordedReproductionCondition {
  classification: ReproductionResult;
  conditionId: string;
  records: RunRecord[];
}

export interface RecordedReproduction {
  bootstrap: {
    command: string;
    toolCallId: string;
    toolResponseEventId: string;
  };
  capturedAt: string;
  conditions: RecordedReproductionCondition[];
  command: string;
  hunterThreadId: string;
  kind: typeof RECORDED_KIND;
  schemaVersion: 2;
  sessionId: string;
  source: {
    artifact: string;
    issueCommit: string;
    issueNumber: number;
    provenanceCommit: string;
    repository: string;
    sourceBlobSha1: string;
    sourceManifestId: string;
  };
  toolCallId: string;
  toolResponseEventId: string;
  turnId: string;
  verdict: "REPRODUCED";
}

export interface RecordedReproductionWriteResult {
  digestSha256: string;
  path: string;
}

export interface ValidatedSourceBootstrap {
  command: string;
  hunterThreadId: string;
  sessionId: string;
  toolCallId: string;
  toolResponseEventId: string;
  turnId: string;
}

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
  return value;
}

export function buildReproductionRunnerSource(
  options: RunnerSourceOptions = {},
): string {
  const boundary = requirePositiveInteger(
    options.observationBoundaryMs ?? REPRODUCTION_OBSERVATION_BOUNDARY_MS,
    "observationBoundaryMs",
  );
  const repetitions = requirePositiveInteger(
    options.repetitionsPerCondition ?? REPRODUCTION_REPETITIONS_PER_CONDITION,
    "repetitionsPerCondition",
  );
  const source = readFileSync(REPRODUCTION_RUNNER_SOURCE, "utf8");
  if (!source.includes("const OBSERVATION_BOUNDARY_MS = 1_000;")) {
    throw new Error("The pinned reproduction runner boundary was not found.");
  }
  if (!source.includes("const REPETITIONS_PER_CONDITION = 10;")) {
    throw new Error("The pinned reproduction runner repetition count was not found.");
  }
  const withBoundary = source.replace(
    "const OBSERVATION_BOUNDARY_MS = 1_000;",
    `const OBSERVATION_BOUNDARY_MS = ${boundary};`,
  );
  const configured = withBoundary.replace(
    "const REPETITIONS_PER_CONDITION = 10;",
    `const REPETITIONS_PER_CONDITION = ${repetitions};`,
  );
  return configured;
}

export function buildTrustedReproductionCommand(manifestId: string): string {
  const manifest = resolveTrustedSourceManifest(manifestId);
  return [
    `cd ${VERDICT_SOURCE_DIR}`,
    `printf '%s  %s\\n' '${manifest.reproductionRunner.sha256}' '${VERDICT_REPRODUCTION_RUNNER}' | sha256sum -c -`,
    `${VERDICT_NODE_BINARY} ${VERDICT_REPRODUCTION_RUNNER}`,
  ].join(" && ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error(`${label} is not valid JSON.`, { cause: error });
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function requireInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
}

function parseEnvironment(value: unknown): Record<string, string> {
  const record = requireRecord(value, "Runner environment");
  const environment: Record<string, string> = {};
  for (const [key, item] of Object.entries(record)) {
    environment[key] = requireString(item, `Runner environment ${key}`);
  }
  if (environment["node"] !== "v22.14.0") {
    throw new Error("Runner environment must use the pinned Node v22.14.0 runtime.");
  }
  if (environment["platform"] !== "linux") {
    throw new Error("Runner environment must be the TrueForge Linux sandbox.");
  }
  if (!new Set(["x64", "arm64"]).has(environment["arch"] ?? "")) {
    throw new Error("Runner environment must report a supported sandbox architecture.");
  }
  if (environment["providerTimeoutMs"] !== "100") {
    throw new Error("Runner environment must retain the pinned provider timeout.");
  }
  return environment;
}

function parseObservation(
  value: unknown,
  conditionId: string,
  index: number,
): RunnerObservation {
  const label = `${conditionId} observation ${index + 1}`;
  const record = requireRecord(value, label);
  if (record["requestSeen"] !== true) {
    throw new Error(`${label} must observe POST /snapshots.`);
  }
  const settlement = requireString(record["settlement"], `${label} settlement`);
  const expectedSettlement =
    conditionId === STALLED_CONDITION ? "pending" : "resolved";
  if (settlement !== expectedSettlement) {
    throw new Error(`${label} must be ${expectedSettlement}.`);
  }
  const responseState = record["responseState"];
  if (conditionId === RESPONSIVE_CONDITION && responseState !== "active") {
    throw new Error(`${label} must resolve with the active snapshot state.`);
  }
  if (conditionId === STALLED_CONDITION && responseState !== null) {
    throw new Error(`${label} must not receive a snapshot state.`);
  }
  const durationMs = requireInteger(record["durationMs"], `${label} durationMs`);
  if (
    conditionId === STALLED_CONDITION &&
    durationMs < REPRODUCTION_OBSERVATION_BOUNDARY_MS
  ) {
    throw new Error(`${label} ended before the observation boundary.`);
  }
  const startedAt = requireString(record["startedAt"], `${label} startedAt`);
  if (Number.isNaN(Date.parse(startedAt))) {
    throw new Error(`${label} startedAt must be an ISO 8601 timestamp.`);
  }
  return {
    durationMs,
    outputExcerpt: requireString(
      record["outputExcerpt"],
      `${label} outputExcerpt`,
    ),
    requestSeen: true,
    responseState: responseState as string | null,
    runId: requireString(record["runId"], `${label} runId`),
    settlement: settlement as RunnerObservation["settlement"],
    startedAt,
  };
}

function parseCondition(value: unknown): RunnerCondition {
  const record = requireRecord(value, "Runner condition");
  const conditionId = requireString(record["conditionId"], "Condition ID");
  if (![STALLED_CONDITION, RESPONSIVE_CONDITION].includes(conditionId)) {
    throw new Error(`Unexpected reproduction condition: ${conditionId}.`);
  }
  if (!Array.isArray(record["observations"])) {
    throw new Error(`${conditionId} observations must be an array.`);
  }
  if (
    record["observations"].length !==
    REPRODUCTION_REPETITIONS_PER_CONDITION
  ) {
    throw new Error(
      `${conditionId} requires exactly ${REPRODUCTION_REPETITIONS_PER_CONDITION} observations.`,
    );
  }
  return {
    conditionId,
    observations: record["observations"].map((observation, index) =>
      parseObservation(observation, conditionId, index),
    ),
  };
}

function parseRunnerEnvelope(
  result: string,
  manifestId: string,
): RunnerEnvelope {
  const lines = result.trim().split(/\r?\n/).filter(Boolean);
  let envelopeValue: unknown;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!;
    try {
      const candidate = JSON.parse(line) as unknown;
      if (isRecord(candidate) && candidate["kind"] === OBSERVATION_KIND) {
        envelopeValue = candidate;
        break;
      }
    } catch {
      // TrueForge can prepend bounded sandbox diagnostics to stdout.
    }
  }
  const envelope = requireRecord(
    envelopeValue,
    "Sandbox reproduction envelope",
  );
  const manifest = resolveTrustedSourceManifest(manifestId);
  if (envelope["schemaVersion"] !== 1) {
    throw new Error("Sandbox reproduction envelope must use schema version 1.");
  }
  if (envelope["sourceManifestId"] !== manifest.id) {
    throw new Error("Sandbox reproduction envelope has the wrong source manifest.");
  }
  if (envelope["package"] !== manifest.artifact.spec) {
    throw new Error("Sandbox reproduction envelope has the wrong package.");
  }
  if (envelope["issueCommit"] !== manifest.issueCommit) {
    throw new Error("Sandbox reproduction envelope has the wrong issue commit.");
  }
  const provider = requireRecord(envelope["provider"], "Runner provider");
  if (
    provider["className"] !== "DaytonaSandboxProvider" ||
    provider["module"] !== "@truefoundry/trueforge-core/core"
  ) {
    throw new Error("Sandbox reproduction must invoke DaytonaSandboxProvider.");
  }
  if (
    envelope["observationBoundaryMs"] !==
    REPRODUCTION_OBSERVATION_BOUNDARY_MS
  ) {
    throw new Error("Sandbox reproduction has the wrong observation boundary.");
  }
  if (!Array.isArray(envelope["conditions"])) {
    throw new Error("Sandbox reproduction conditions must be an array.");
  }
  const conditions = envelope["conditions"].map(parseCondition);
  if (
    conditions.length !== 2 ||
    conditions[0]?.conditionId !== STALLED_CONDITION ||
    conditions[1]?.conditionId !== RESPONSIVE_CONDITION
  ) {
    throw new Error(
      "Sandbox reproduction must contain the ordered stalled and responsive conditions.",
    );
  }
  return {
    conditions,
    environment: parseEnvironment(envelope["environment"]),
    issueCommit: manifest.issueCommit,
    kind: OBSERVATION_KIND,
    observationBoundaryMs: REPRODUCTION_OBSERVATION_BOUNDARY_MS,
    package: manifest.artifact.spec,
    provider: {
      className: "DaytonaSandboxProvider",
      module: "@truefoundry/trueforge-core/core",
    },
    schemaVersion: 1,
    sourceManifestId: manifest.id,
  };
}

interface SuccessfulSandboxResponse {
  result: string;
}

function parseSuccessfulSandboxResponse(
  content: string,
  label: "bootstrap" | "reproduction",
): SuccessfulSandboxResponse {
  const outer = requireRecord(
    parseJson(content, "Sandbox tool response"),
    "Sandbox tool response",
  );
  if (outer["success"] !== true) {
    throw new Error(`The trusted ${label} command did not succeed.`);
  }
  const response = requireRecord(outer["response"], "Sandbox response");
  if (response["exitCode"] !== 0) {
    throw new Error(`The trusted ${label} command exited non-zero.`);
  }
  return {
    result: requireString(response["result"], "Sandbox result"),
  };
}

function parseSandboxResult(content: string, manifestId: string): RunnerEnvelope {
  return parseRunnerEnvelope(
    parseSuccessfulSandboxResponse(content, "reproduction").result,
    manifestId,
  );
}

function parseExecCommandCandidate(argumentsJson: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(argumentsJson) as unknown;
  } catch {
    return null;
  }
  return isRecord(parsed) && typeof parsed["command"] === "string"
    ? parsed["command"]
    : null;
}

function requireSandboxExecCommand(
  toolCall: VerdictEventProjection["modelToolCalls"][number],
): string {
  if (
    toolCall.functionName !== "exec" ||
    toolCall.toolInfo?.type !== "truefoundry-system" ||
    toolCall.toolInfo.name !== "exec"
  ) {
    throw new Error("Trusted reproduction requires the TrueForge sandbox exec tool.");
  }
  const argumentsRecord = requireRecord(
    parseJson(toolCall.argumentsJson, "Sandbox exec arguments"),
    "Sandbox exec arguments",
  );
  if ("cwd" in argumentsRecord || "env" in argumentsRecord) {
    throw new Error("Trusted sandbox exec must not set cwd or env.");
  }
  const unsupported = Object.keys(argumentsRecord).filter(
    (key) => key !== "command" && key !== "intent",
  );
  if (unsupported.length > 0) {
    throw new Error("Trusted sandbox exec contains unsupported arguments.");
  }
  requireString(argumentsRecord["intent"], "Sandbox exec intent");
  return requireString(argumentsRecord["command"], "Sandbox exec command");
}

function findResponseToolCall(
  projection: VerdictEventProjection,
  event: TrueForgeApi.ToolResponseEvent,
): VerdictEventProjection["modelToolCalls"][number] | null {
  const matches = projection.modelToolCalls.filter(
    (toolCall) =>
      toolCall.threadId === event.threadId &&
      toolCall.toolCallId === event.toolCallId,
  );
  return matches.length === 1 ? matches[0]! : null;
}

function assertTargetMatchesManifest(
  target: InvestigationTarget,
): ReturnType<typeof resolveTrustedSourceManifest> {
  const manifest = resolveTrustedSourceManifest(target.sourceManifestId);
  if (
    target.repository !== manifest.repository ||
    target.issueNumber !== manifest.issueNumber
  ) {
    throw new Error("Reproduction target must match the trusted source manifest.");
  }
  return manifest;
}

function requireHunter(
  projection: VerdictEventProjection,
  threadId: string,
): boolean {
  return projection.threads.some(
    (thread) => thread.threadId === threadId && thread.name === "Hunter",
  );
}

function parseBootstrapResult(
  content: string,
  manifest: ReturnType<typeof resolveTrustedSourceManifest>,
): void {
  const { result } = parseSuccessfulSandboxResponse(content, "bootstrap");
  const lines = result.trim().split(/\r?\n/).filter(Boolean);
  let verified: Record<string, unknown> | null = null;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const candidate = JSON.parse(lines[index]!) as unknown;
      if (isRecord(candidate) && candidate["status"] === "bootstrap-verified") {
        verified = candidate;
        break;
      }
    } catch {
      // Checksum tools and npm may emit bounded diagnostics around the JSON line.
    }
  }
  if (!verified) {
    throw new Error("The trusted bootstrap did not emit its verified record.");
  }
  if (
    verified["manifestId"] !== manifest.id ||
    verified["package"] !== manifest.artifact.spec ||
    verified["provenanceCommit"] !== manifest.artifact.provenanceCommit ||
    verified["sourceBlob"] !== manifest.source.blobSha1
  ) {
    throw new Error("The trusted bootstrap record does not match the source manifest.");
  }
}

export function captureValidatedSourceBootstrap(
  projection: VerdictEventProjection,
  event: TrueForgeApi.TurnStreamingEvent,
  target: InvestigationTarget,
): ValidatedSourceBootstrap | null {
  if (event.type !== "tool.response" || !requireHunter(projection, event.threadId)) {
    return null;
  }
  const manifest = assertTargetMatchesManifest(target);
  const modelToolCall = findResponseToolCall(projection, event);
  if (!modelToolCall) {
    return null;
  }
  const expectedCommand = buildSourceBootstrapCommand(manifest.id);
  if (parseExecCommandCandidate(modelToolCall.argumentsJson) !== expectedCommand) {
    return null;
  }
  if (requireSandboxExecCommand(modelToolCall) !== expectedCommand) {
    throw new Error("The trusted bootstrap command changed before execution.");
  }
  const execCalls = projection.modelToolCalls.filter(
    (toolCall) =>
      toolCall.functionName === "exec" ||
      (toolCall.toolInfo?.type === "truefoundry-system" &&
        toolCall.toolInfo.name === "exec"),
  );
  if (
    execCalls.length !== 1 ||
    execCalls[0]?.threadId !== event.threadId ||
    execCalls[0]?.toolCallId !== event.toolCallId
  ) {
    throw new Error("Verdict observed an untrusted sandbox exec before bootstrap.");
  }
  if (!projection.turnId) {
    throw new Error("Validated bootstrap requires a TrueForge turn ID.");
  }
  parseBootstrapResult(event.content, manifest);
  return {
    command: expectedCommand,
    hunterThreadId: event.threadId,
    sessionId: projection.sessionId,
    toolCallId: event.toolCallId,
    toolResponseEventId: event.id,
    turnId: projection.turnId,
  };
}

function assertTrustedExecutionSequence(
  projection: VerdictEventProjection,
  event: TrueForgeApi.ToolResponseEvent,
  bootstrap: ValidatedSourceBootstrap,
  bootstrapCommand: string,
  reproductionCommand: string,
): void {
  if (
    bootstrap.sessionId !== projection.sessionId ||
    bootstrap.turnId !== projection.turnId ||
    bootstrap.hunterThreadId !== event.threadId ||
    bootstrap.command !== bootstrapCommand
  ) {
    throw new Error("Reproduction does not follow the successful trusted bootstrap.");
  }
  const execCalls = projection.modelToolCalls.filter(
    (toolCall) =>
      toolCall.functionName === "exec" ||
      (toolCall.toolInfo?.type === "truefoundry-system" &&
        toolCall.toolInfo.name === "exec"),
  );
  for (const [index, toolCall] of execCalls.entries()) {
    const command = requireSandboxExecCommand(toolCall);
    const expected = index === 0 ? bootstrapCommand : reproductionCommand;
    if (toolCall.threadId !== event.threadId || command !== expected) {
      throw new Error("Verdict observed an untrusted sandbox exec in the reproduction chain.");
    }
  }
  const first = execCalls[0];
  const last = execCalls.at(-1);
  if (
    execCalls.length < 2 ||
    first?.toolCallId !== bootstrap.toolCallId ||
    last?.toolCallId !== event.toolCallId
  ) {
    throw new Error("Reproduction does not have a complete trusted exec sequence.");
  }
}

function toRunRecords(
  condition: RunnerCondition,
  command: string,
  environment: Record<string, string>,
  caseId: string,
  commitSha: string,
): RunRecord[] {
  const stalled = condition.conditionId === STALLED_CONDITION;
  return condition.observations.map((observation) => ({
    schemaVersion: 1,
    caseId,
    conditionId: condition.conditionId,
    runId: observation.runId,
    phase: "matrix",
    commitSha,
    command,
    environment,
    startedAt: observation.startedAt,
    durationMs: observation.durationMs,
    outputExcerpt: observation.outputExcerpt,
    outcome: stalled ? "FAIL_MATCH" : "PASS",
    signatureMatched: stalled,
    ...(stalled
      ? {
          exitCode: null,
          observation: {
            boundaryMs: REPRODUCTION_OBSERVATION_BOUNDARY_MS,
            state: "PENDING_AT_BOUNDARY" as const,
          },
        }
      : { exitCode: 0 }),
  } as RunRecord));
}

export function captureRecordedReproduction(
  projection: VerdictEventProjection,
  event: TrueForgeApi.TurnStreamingEvent,
  target: InvestigationTarget,
  bootstrap: ValidatedSourceBootstrap | null,
): RecordedReproduction | null {
  if (event.type !== "tool.response") {
    return null;
  }
  const manifest = assertTargetMatchesManifest(target);
  if (!requireHunter(projection, event.threadId)) {
    return null;
  }
  const modelToolCall = findResponseToolCall(projection, event);
  if (!modelToolCall) {
    return null;
  }
  const trustedCommand = buildTrustedReproductionCommand(manifest.id);
  if (parseExecCommandCandidate(modelToolCall.argumentsJson) !== trustedCommand) {
    return null;
  }
  if (requireSandboxExecCommand(modelToolCall) !== trustedCommand) {
    throw new Error("The trusted reproduction command changed before execution.");
  }
  if (!bootstrap) {
    throw new Error("Reproduction requires a successful trusted bootstrap.");
  }
  if (!projection.turnId) {
    throw new Error("Recorded reproduction requires a TrueForge turn ID.");
  }
  const bootstrapCommand = buildSourceBootstrapCommand(manifest.id);
  assertTrustedExecutionSequence(
    projection,
    event,
    bootstrap,
    bootstrapCommand,
    trustedCommand,
  );
  const envelope = parseSandboxResult(event.content, manifest.id);
  const environment = {
    ...envelope.environment,
    observationBoundaryMs: String(envelope.observationBoundaryMs),
    package: envelope.package,
    providerClass: envelope.provider.className,
    providerModule: envelope.provider.module,
    sourceManifestId: envelope.sourceManifestId,
  };
  const caseId = `${manifest.repository}#${manifest.issueNumber}`;
  const conditions = envelope.conditions.map((condition) => {
    const records = toRunRecords(
      condition,
      trustedCommand,
      environment,
      caseId,
      manifest.issueCommit,
    );
    return {
      classification: classifyReproduction(
        records,
        REPRODUCTION_REPETITIONS_PER_CONDITION,
      ),
      conditionId: condition.conditionId,
      records,
    };
  });
  if (
    conditions[0]?.classification.state !== "REPRODUCTION_PINNED" ||
    conditions[1]?.classification.state !== "NOT_REPRODUCED"
  ) {
    throw new Error(
      "The provider observations do not establish a reproduced bug and responsive contrast.",
    );
  }
  return {
    bootstrap: {
      command: bootstrap.command,
      toolCallId: bootstrap.toolCallId,
      toolResponseEventId: bootstrap.toolResponseEventId,
    },
    capturedAt: event.createdAt,
    conditions,
    command: trustedCommand,
    hunterThreadId: event.threadId,
    kind: RECORDED_KIND,
    schemaVersion: 2,
    sessionId: projection.sessionId,
    source: {
      artifact: manifest.artifact.spec,
      issueCommit: manifest.issueCommit,
      issueNumber: manifest.issueNumber,
      provenanceCommit: manifest.artifact.provenanceCommit,
      repository: manifest.repository,
      sourceBlobSha1: manifest.source.blobSha1,
      sourceManifestId: manifest.id,
    },
    toolCallId: event.toolCallId,
    toolResponseEventId: event.id,
    turnId: projection.turnId,
    verdict: "REPRODUCED",
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function serializedEvidence(evidence: RecordedReproduction): {
  bytes: string;
  digestSha256: string;
} {
  const canonicalEvidence = JSON.stringify(canonicalize(evidence));
  const digestSha256 = createHash("sha256")
    .update(canonicalEvidence)
    .digest("hex");
  const bytes = `${JSON.stringify(
    canonicalize({
      ...evidence,
      integrity: { algorithm: "sha256", evidenceSha256: digestSha256 },
    }),
    null,
    2,
  )}\n`;
  return { bytes, digestSha256 };
}

function errorCode(error: unknown): string | null {
  return isRecord(error) && typeof error["code"] === "string"
    ? error["code"]
    : null;
}

export async function writeRecordedReproduction(
  path: string,
  evidence: RecordedReproduction,
): Promise<RecordedReproductionWriteResult> {
  const normalizedPath = path.trim();
  if (!normalizedPath) {
    throw new Error("Recorded reproduction path is required.");
  }
  const { bytes, digestSha256 } = serializedEvidence(evidence);
  await mkdir(dirname(normalizedPath), { recursive: true });
  const temporaryPath = `${normalizedPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, bytes, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o644,
  });
  try {
    try {
      await link(temporaryPath, normalizedPath);
    } catch (error) {
      if (errorCode(error) !== "EEXIST") {
        throw error;
      }
      const existing = await readFile(normalizedPath, "utf8");
      if (existing !== bytes) {
        throw new Error(
          `Refusing to overwrite recorded reproduction evidence at ${normalizedPath}.`,
          { cause: error },
        );
      }
    }
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
  return { digestSha256, path: normalizedPath };
}
