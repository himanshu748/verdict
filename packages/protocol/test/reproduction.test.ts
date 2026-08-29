import { describe, expect, it } from "vitest";
import {
  classifyReproduction,
  EvidenceInvariantError,
  runRecordSchema,
  type RunOutcome,
  type RunRecord,
} from "../src/index.js";

type RecordOverrides = Partial<RunRecord> & { conditionId?: string };

function record(
  index: number,
  outcome: RunOutcome,
  overrides: RecordOverrides = {},
): RunRecord & { conditionId: string } {
  return {
    schemaVersion: 1,
    caseId: "case-0041",
    conditionId: "condition-pacific-chatham",
    runId: `run-${index}`,
    phase: "matrix",
    commitSha: "abcdef1234567890",
    command: "pnpm test --filter retry-race",
    environment: { TZ: "Pacific/Chatham" },
    startedAt: "2026-08-24T10:30:00.000Z",
    durationMs: 420,
    exitCode: outcome === "PASS" ? 0 : outcome === "FAIL_MATCH" ? 1 : null,
    outcome,
    signatureMatched: outcome === "FAIL_MATCH",
    outputExcerpt: "bounded output",
    ...overrides,
  } as RunRecord & { conditionId: string };
}

function records(outcomes: RunOutcome[]): RunRecord[] {
  return outcomes.map((outcome, index) => record(index, outcome));
}

function thrownBy(operation: () => unknown): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }

  throw new Error("Expected operation to throw");
}

describe("runRecordSchema", () => {
  it("requires a stable condition identity", () => {
    const { conditionId: _conditionId, ...withoutConditionId } = record(0, "PASS");

    expect(runRecordSchema.safeParse(withoutConditionId).success).toBe(false);
  });

  it.each([
    {
      label: "matched failure without a signature",
      value: record(0, "FAIL_MATCH", { signatureMatched: false }),
    },
    {
      label: "matched failure with a successful exit",
      value: record(0, "FAIL_MATCH", { exitCode: 0 }),
    },
    {
      label: "pass with a failure signature",
      value: record(0, "PASS", { signatureMatched: true }),
    },
    {
      label: "pass with a non-zero exit",
      value: record(0, "PASS", { exitCode: 1 }),
    },
    {
      label: "unresolved run with a failure signature",
      value: record(0, "UNRESOLVED", { signatureMatched: true }),
    },
    {
      label: "unresolved run with a successful exit",
      value: record(0, "UNRESOLVED", { exitCode: 0 }),
    },
  ])("rejects contradictory $label", ({ value }) => {
    expect(runRecordSchema.safeParse(value).success).toBe(false);
  });

  it.each([
    record(0, "FAIL_MATCH"),
    record(1, "PASS"),
    record(2, "UNRESOLVED"),
  ])("accepts internally consistent $outcome records", (value) => {
    expect(runRecordSchema.safeParse(value).success).toBe(true);
  });

  it("represents a matched pending call without inventing a process exit", () => {
    const pending = {
      ...record(0, "FAIL_MATCH"),
      exitCode: null,
      observation: {
        boundaryMs: 1_000,
        state: "PENDING_AT_BOUNDARY",
      },
    };

    expect(runRecordSchema.safeParse(pending).success).toBe(true);
  });

  it.each([
    {
      label: "pending matched call without its observation marker",
      value: { ...record(0, "FAIL_MATCH"), exitCode: null },
    },
    {
      label: "exited matched call with a pending observation marker",
      value: {
        ...record(0, "FAIL_MATCH"),
        observation: {
          boundaryMs: 1_000,
          state: "PENDING_AT_BOUNDARY",
        },
      },
    },
  ])("rejects a contradictory $label", ({ value }) => {
    expect(runRecordSchema.safeParse(value).success).toBe(false);
  });
});

describe("classifyReproduction", () => {
  it("pins at the exact all-matching threshold", () => {
    const result = classifyReproduction(records(Array<RunOutcome>(10).fill("FAIL_MATCH")));
    expect(result).toMatchObject({ state: "REPRODUCTION_PINNED", matched: 10, observed: 10 });
  });

  it("pins above the threshold when every valid observation matches", () => {
    const result = classifyReproduction(records(Array<RunOutcome>(11).fill("FAIL_MATCH")));
    expect(result).toMatchObject({ state: "REPRODUCTION_PINNED", matched: 11, observed: 11 });
  });

  it("does not pin ten matches when an eleventh valid observation passes", () => {
    const result = classifyReproduction(
      records([...Array<RunOutcome>(10).fill("FAIL_MATCH"), "PASS"]),
    );
    expect(result).toMatchObject({ state: "PARTIAL_REPRODUCTION", matched: 10, observed: 11 });
  });

  it("keeps unresolved runs out of the valid denominator", () => {
    const result = classifyReproduction(
      records([...Array<RunOutcome>(10).fill("FAIL_MATCH"), "UNRESOLVED"]),
    );
    expect(result).toMatchObject({
      state: "REPRODUCTION_PINNED",
      matched: 10,
      observed: 10,
      unresolved: 1,
    });
  });

  it("stays unresolved below the valid observation threshold", () => {
    const result = classifyReproduction(
      records([...Array<RunOutcome>(9).fill("FAIL_MATCH"), "UNRESOLVED"]),
    );
    expect(result).toMatchObject({ state: "UNRESOLVED", matched: 9, observed: 9, unresolved: 1 });
  });

  it.each([
    { matches: 7, expected: "PARTIAL_REPRODUCTION" },
    { matches: 2, expected: "WEAK_SIGNAL" },
    { matches: 0, expected: "NOT_REPRODUCED" },
  ])("returns $expected for $matches matches", ({ matches, expected }) => {
    const outcomes: RunOutcome[] = [
      ...Array<RunOutcome>(matches).fill("FAIL_MATCH"),
      ...Array<RunOutcome>(10 - matches).fill("PASS"),
    ];
    expect(classifyReproduction(records(outcomes)).state).toBe(expected);
  });

  it("rejects duplicate run IDs instead of counting the same evidence twice", () => {
    const evidence = records(Array<RunOutcome>(9).fill("FAIL_MATCH"));
    evidence.push(record(0, "FAIL_MATCH"));
    const error = thrownBy(() => classifyReproduction(evidence));

    expect(error).toBeInstanceOf(EvidenceInvariantError);
    expect(error).toMatchObject({
      name: "EvidenceInvariantError",
      code: "DUPLICATE_RUN_ID",
      runId: "run-0",
    });
  });

  it.each([
    {
      field: "conditionId",
      overrides: { conditionId: "condition-utc" },
    },
    {
      field: "caseId",
      overrides: { caseId: "case-0099" },
    },
    {
      field: "phase",
      overrides: { phase: "regression" },
    },
    {
      field: "commitSha",
      overrides: { commitSha: "fedcba9876543210" },
    },
    {
      field: "environment",
      overrides: { environment: { TZ: "UTC" } },
    },
    {
      field: "command",
      overrides: { command: "pnpm test --filter another-case" },
    },
  ] satisfies Array<{ field: string; overrides: RecordOverrides }>)(
    "rejects a mixed $field evidence set",
    ({ field, overrides }) => {
      const evidence = [record(0, "FAIL_MATCH"), record(1, "FAIL_MATCH", overrides)];
      const error = thrownBy(() => classifyReproduction(evidence));

      expect(error).toBeInstanceOf(EvidenceInvariantError);
      expect(error).toMatchObject({
        name: "EvidenceInvariantError",
        code: "MIXED_EVIDENCE_SET",
        field,
        runId: "run-1",
      });
    },
  );

  it("compares environments by value rather than object key order", () => {
    const evidence = [
      record(0, "FAIL_MATCH", { environment: { LANG: "en_US.UTF-8", TZ: "UTC" } }),
      record(1, "FAIL_MATCH", { environment: { TZ: "UTC", LANG: "en_US.UTF-8" } }),
    ];

    expect(classifyReproduction(evidence, 2).state).toBe("REPRODUCTION_PINNED");
  });

  it("rejects an invalid record before deriving a verdict", () => {
    const invalid = record(0, "PASS", { durationMs: -1 });
    const error = thrownBy(() => classifyReproduction([invalid]));

    expect(error).toBeInstanceOf(EvidenceInvariantError);
    expect(error).toMatchObject({
      name: "EvidenceInvariantError",
      code: "INVALID_RUN_RECORD",
      runId: "run-0",
    });
  });

  it("rejects a contradictory record before deriving a verdict", () => {
    const contradictory = record(0, "FAIL_MATCH", { signatureMatched: false });
    const error = thrownBy(() => classifyReproduction([contradictory]));

    expect(error).toBeInstanceOf(EvidenceInvariantError);
    expect(error).toMatchObject({
      name: "EvidenceInvariantError",
      code: "INVALID_RUN_RECORD",
      runId: "run-0",
    });
  });
});
