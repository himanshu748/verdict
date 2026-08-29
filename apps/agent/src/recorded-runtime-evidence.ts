import { createHash } from "node:crypto";

export const RECORDED_RUNTIME_EVIDENCE_PATH =
  "evidence/trueforge-417/reproduction.json";

export interface RecordedRuntimeEvidenceBinding {
  canonicalSha256: string;
  hunterThreadId: string;
  path: string;
  provider: string;
  responsiveControls: number;
  sourceManifestId: string;
  stalledRuns: number;
  trueForgeSessionId: string;
  verdict: "REPRODUCED";
}

export const TRUSTED_RECORDED_RUNTIME_EVIDENCE: Readonly<RecordedRuntimeEvidenceBinding> =
  Object.freeze({
    canonicalSha256:
      "a8bb5dd22e083782bd7782fccb0a1343b59fc77ea8525b6358fecc9b5b8baffa",
    hunterThreadId: "8ed4cc99-7c90-48df-bc39-f237c55761af",
    path: RECORDED_RUNTIME_EVIDENCE_PATH,
    provider: "@truefoundry/trueforge-core@0.1.4#DaytonaSandboxProvider",
    responsiveControls: 10,
    sourceManifestId: "trueforge-417-v1",
    stalledRuns: 10,
    trueForgeSessionId: "01m16a555jy0b09pp9ze5296ng",
    verdict: "REPRODUCED",
  });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function requireExact(
  value: unknown,
  expected: unknown,
  field: string,
): void {
  if (value !== expected) {
    throw new Error(`Recorded runtime evidence field ${field} is invalid.`);
  }
}

function validateEnvironment(value: unknown): void {
  if (!isRecord(value)) {
    throw new Error("Recorded runtime evidence environment is invalid.");
  }
  const checks: Array<[string, unknown, unknown]> = [
    ["arch", value.arch, "x64"],
    ["node", value.node, "v22.14.0"],
    ["package", value.package, "@truefoundry/trueforge-core@0.1.4"],
    ["platform", value.platform, "linux"],
    ["providerClass", value.providerClass, "DaytonaSandboxProvider"],
    ["providerModule", value.providerModule, "@truefoundry/trueforge-core/core"],
    ["sourceManifestId", value.sourceManifestId, "trueforge-417-v1"],
  ];
  const mismatch = checks.find(([, actual, expected]) => actual !== expected);
  if (mismatch) {
    throw new Error(
      `Recorded runtime evidence environment field ${mismatch[0]} is invalid.`,
    );
  }
}

function validateCondition(
  value: unknown,
  expected: {
    conditionId: string;
    matched: number;
    outcome: string;
    signatureMatched: boolean;
    state: string;
  },
): void {
  if (
    !isRecord(value) ||
    !isRecord(value.classification) ||
    !Array.isArray(value.records)
  ) {
    throw new Error(`Recorded runtime condition ${expected.conditionId} is invalid.`);
  }
  requireExact(value.conditionId, expected.conditionId, "conditionId");
  requireExact(value.classification.matched, expected.matched, "matched");
  requireExact(value.classification.observed, 10, "observed");
  requireExact(value.classification.requiredValidRuns, 10, "requiredValidRuns");
  requireExact(value.classification.state, expected.state, "state");
  requireExact(value.classification.unresolved, 0, "unresolved");
  requireExact(value.records.length, 10, "records.length");

  for (const record of value.records) {
    if (!isRecord(record)) {
      throw new Error(
        `Recorded runtime condition ${expected.conditionId} has an invalid record.`,
      );
    }
    requireExact(record.conditionId, expected.conditionId, "record.conditionId");
    requireExact(record.outcome, expected.outcome, "record.outcome");
    requireExact(
      record.signatureMatched,
      expected.signatureMatched,
      "record.signatureMatched",
    );
    validateEnvironment(record.environment);
    if (expected.conditionId === "daytona-stalled-endpoint") {
      requireExact(record.exitCode, null, "record.exitCode");
      if (!isRecord(record.observation)) {
        throw new Error("Recorded stalled runtime observation is invalid.");
      }
      requireExact(record.observation.boundaryMs, 1_000, "observation.boundaryMs");
      requireExact(
        record.observation.state,
        "PENDING_AT_BOUNDARY",
        "observation.state",
      );
    } else {
      requireExact(record.exitCode, 0, "record.exitCode");
    }
  }
}

export function parseRecordedRuntimeEvidence(
  content: string,
): RecordedRuntimeEvidenceBinding {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new Error("Recorded runtime evidence is not valid JSON.");
  }
  if (!isRecord(parsed) || !isRecord(parsed.integrity)) {
    throw new Error("Recorded runtime evidence is not a valid object.");
  }

  const { integrity, ...evidence } = parsed;
  requireExact(integrity.algorithm, "sha256", "integrity.algorithm");
  if (typeof integrity.evidenceSha256 !== "string") {
    throw new Error("Recorded runtime evidence canonical SHA-256 is invalid.");
  }
  const canonicalSha256 = createHash("sha256")
    .update(JSON.stringify(canonicalize(evidence)))
    .digest("hex");
  if (
    canonicalSha256 !== integrity.evidenceSha256 ||
    canonicalSha256 !== TRUSTED_RECORDED_RUNTIME_EVIDENCE.canonicalSha256
  ) {
    throw new Error("Recorded runtime evidence canonical SHA-256 is invalid.");
  }

  requireExact(parsed.schemaVersion, 2, "schemaVersion");
  requireExact(parsed.kind, "verdict.recorded-reproduction", "kind");
  requireExact(parsed.verdict, "REPRODUCED", "verdict");
  requireExact(
    parsed.sessionId,
    TRUSTED_RECORDED_RUNTIME_EVIDENCE.trueForgeSessionId,
    "sessionId",
  );
  requireExact(
    parsed.hunterThreadId,
    TRUSTED_RECORDED_RUNTIME_EVIDENCE.hunterThreadId,
    "hunterThreadId",
  );
  if (!isRecord(parsed.source)) {
    throw new Error("Recorded runtime evidence source is invalid.");
  }
  requireExact(parsed.source.repository, "truefoundry/trueforge", "source.repository");
  requireExact(parsed.source.issueNumber, 417, "source.issueNumber");
  requireExact(
    parsed.source.sourceManifestId,
    TRUSTED_RECORDED_RUNTIME_EVIDENCE.sourceManifestId,
    "source.sourceManifestId",
  );
  requireExact(
    parsed.source.artifact,
    "@truefoundry/trueforge-core@0.1.4",
    "source.artifact",
  );

  if (!Array.isArray(parsed.conditions) || parsed.conditions.length !== 2) {
    throw new Error("Recorded runtime evidence conditions are invalid.");
  }
  validateCondition(parsed.conditions[0], {
    conditionId: "daytona-stalled-endpoint",
    matched: 10,
    outcome: "FAIL_MATCH",
    signatureMatched: true,
    state: "REPRODUCTION_PINNED",
  });
  validateCondition(parsed.conditions[1], {
    conditionId: "daytona-responsive-endpoint",
    matched: 0,
    outcome: "PASS",
    signatureMatched: false,
    state: "NOT_REPRODUCED",
  });

  return { ...TRUSTED_RECORDED_RUNTIME_EVIDENCE };
}
