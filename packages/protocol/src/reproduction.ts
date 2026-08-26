import { z } from "zod";
import { runRecordSchema, type RunRecord } from "./run-record.js";

export const reproductionStateSchema = z.enum([
  "REPRODUCTION_PINNED",
  "PARTIAL_REPRODUCTION",
  "WEAK_SIGNAL",
  "NOT_REPRODUCED",
  "UNRESOLVED",
]);

export const reproductionResultSchema = z.object({
  state: reproductionStateSchema,
  matched: z.number().int().nonnegative(),
  observed: z.number().int().nonnegative(),
  unresolved: z.number().int().nonnegative(),
  requiredValidRuns: z.number().int().positive(),
});

export type ReproductionState = z.infer<typeof reproductionStateSchema>;
export type ReproductionResult = z.infer<typeof reproductionResultSchema>;

export type EvidenceInvariantCode =
  | "INVALID_RUN_RECORD"
  | "DUPLICATE_RUN_ID"
  | "MIXED_EVIDENCE_SET";

export type EvidenceSetField =
  | "caseId"
  | "conditionId"
  | "phase"
  | "commitSha"
  | "command"
  | "environment";

interface EvidenceInvariantErrorOptions {
  code: EvidenceInvariantCode;
  message: string;
  runId?: string;
  field?: EvidenceSetField;
  cause?: unknown;
}

export class EvidenceInvariantError extends Error {
  readonly code: EvidenceInvariantCode;
  readonly runId: string | undefined;
  readonly field: EvidenceSetField | undefined;

  constructor({ code, message, runId, field, cause }: EvidenceInvariantErrorOptions) {
    super(message, { cause });
    this.name = "EvidenceInvariantError";
    this.code = code;
    this.runId = runId;
    this.field = field;
  }
}

function parseRecords(records: readonly RunRecord[]): RunRecord[] {
  return records.map((record) => {
    const parsed = runRecordSchema.safeParse(record);
    if (!parsed.success) {
      const runId =
        typeof (record as { runId?: unknown }).runId === "string"
          ? (record as { runId: string }).runId
          : undefined;
      throw new EvidenceInvariantError({
        code: "INVALID_RUN_RECORD",
        message: runId ? `Run record ${runId} is invalid` : "Run record is invalid",
        ...(runId === undefined ? {} : { runId }),
        cause: parsed.error,
      });
    }

    return parsed.data;
  });
}

function canonicalEnvironment(environment: Readonly<Record<string, string>>): string {
  const entries = Object.entries(environment).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  return JSON.stringify(entries);
}

function assertUniqueRunIds(records: readonly RunRecord[]): void {
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.runId)) {
      throw new EvidenceInvariantError({
        code: "DUPLICATE_RUN_ID",
        message: `Run ID ${record.runId} occurs more than once`,
        runId: record.runId,
      });
    }
    seen.add(record.runId);
  }
}

function assertSingleEvidenceSet(records: readonly RunRecord[]): void {
  const baseline = records[0];
  if (baseline === undefined) {
    return;
  }

  const baselineEnvironment = canonicalEnvironment(baseline.environment);
  const fields = ["caseId", "conditionId", "phase", "commitSha", "command"] as const;

  for (const record of records.slice(1)) {
    const mixedField = fields.find((field) => record[field] !== baseline[field]);
    const field: EvidenceSetField | undefined =
      mixedField ??
      (canonicalEnvironment(record.environment) === baselineEnvironment
        ? undefined
        : "environment");

    if (field !== undefined) {
      throw new EvidenceInvariantError({
        code: "MIXED_EVIDENCE_SET",
        message: `Run ${record.runId} has a different ${field} from the evidence set`,
        runId: record.runId,
        field,
      });
    }
  }
}

export function classifyReproduction(
  records: readonly RunRecord[],
  requiredValidRuns = 10,
): ReproductionResult {
  if (!Number.isInteger(requiredValidRuns) || requiredValidRuns < 1) {
    throw new RangeError("requiredValidRuns must be a positive integer");
  }

  const validatedRecords = parseRecords(records);
  assertUniqueRunIds(validatedRecords);
  assertSingleEvidenceSet(validatedRecords);

  const unresolved = validatedRecords.filter((record) => record.outcome === "UNRESOLVED").length;
  const observedRecords = validatedRecords.filter((record) => record.outcome !== "UNRESOLVED");
  const observed = observedRecords.length;
  const matched = observedRecords.filter((record) => record.outcome === "FAIL_MATCH").length;

  if (observed < requiredValidRuns) {
    return {
      state: "UNRESOLVED",
      matched,
      observed,
      unresolved,
      requiredValidRuns,
    };
  }

  const state: ReproductionState =
    matched === observed
      ? "REPRODUCTION_PINNED"
      : matched >= 4
        ? "PARTIAL_REPRODUCTION"
        : matched >= 1
          ? "WEAK_SIGNAL"
          : "NOT_REPRODUCED";

  return { state, matched, observed, unresolved, requiredValidRuns };
}
