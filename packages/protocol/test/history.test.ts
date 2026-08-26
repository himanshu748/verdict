import { describe, expect, it } from "vitest";
import {
  classifyBoundary,
  HistoryInvariantError,
  type HistoryObservation,
} from "../src/index.js";

function observation(
  chronologicalIndex: number,
  outcome: HistoryObservation["outcome"],
): HistoryObservation {
  return {
    commitSha: `commit-${chronologicalIndex}`,
    chronologicalIndex,
    outcome,
  };
}

function thrownBy(operation: () => unknown): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }

  throw new Error("Expected operation to throw");
}

describe("classifyBoundary", () => {
  it("returns an exact adjacent pass-to-failure boundary", () => {
    const result = classifyBoundary([
      observation(0, "PASS"),
      observation(1, "PASS"),
      observation(2, "FAIL_MATCH"),
      observation(3, "FAIL_MATCH"),
    ]);
    expect(result).toEqual({
      state: "EXACT_BOUNDARY",
      goodCommit: "commit-1",
      badCommit: "commit-2",
    });
  });

  it("returns a range when unresolved history separates the endpoints", () => {
    const result = classifyBoundary([
      observation(0, "PASS"),
      observation(1, "UNRESOLVED"),
      observation(2, "FAIL_MATCH"),
    ]);
    expect(result.state).toBe("BOUNDARY_RANGE");
  });

  it("does not force a boundary onto nonmonotonic history", () => {
    const result = classifyBoundary([
      observation(0, "PASS"),
      observation(1, "FAIL_MATCH"),
      observation(2, "PASS"),
    ]);
    expect(result.state).toBe("NON_MONOTONIC");
  });

  it("returns unresolved when both sides are not demonstrated", () => {
    const result = classifyBoundary([
      observation(0, "PASS"),
      observation(1, "PASS"),
    ]);
    expect(result.state).toBe("UNRESOLVED");
  });

  it("rejects an invalid observation before deriving a boundary", () => {
    const invalid = {
      commitSha: "short",
      chronologicalIndex: 1,
      outcome: "PASS",
    } as unknown as HistoryObservation;
    const error = thrownBy(() =>
      classifyBoundary([observation(0, "PASS"), invalid, observation(2, "FAIL_MATCH")]),
    );

    expect(error).toBeInstanceOf(HistoryInvariantError);
    expect(error).toMatchObject({
      name: "HistoryInvariantError",
      code: "INVALID_HISTORY_OBSERVATION",
      observationIndex: 1,
      commitSha: "short",
    });
  });

  it.each([null, undefined])("rejects a nullish observation with a domain error", (invalid) => {
    const error = thrownBy(() =>
      classifyBoundary([invalid as unknown as HistoryObservation]),
    );

    expect(error).toBeInstanceOf(HistoryInvariantError);
    expect(error).toMatchObject({
      name: "HistoryInvariantError",
      code: "INVALID_HISTORY_OBSERVATION",
      observationIndex: 0,
    });
  });

  it("rejects conflicting observations with the same chronological index", () => {
    const repeatedIndex = {
      ...observation(0, "FAIL_MATCH"),
      commitSha: "commit-b",
    };
    const error = thrownBy(() => classifyBoundary([observation(0, "PASS"), repeatedIndex]));

    expect(error).toBeInstanceOf(HistoryInvariantError);
    expect(error).toMatchObject({
      name: "HistoryInvariantError",
      code: "DUPLICATE_CHRONOLOGICAL_INDEX",
      observationIndex: 1,
      chronologicalIndex: 0,
    });
  });

  it("rejects conflicting observations for the same commit SHA", () => {
    const repeatedCommit = {
      ...observation(1, "FAIL_MATCH"),
      commitSha: "commit-0",
    };
    const error = thrownBy(() => classifyBoundary([observation(0, "PASS"), repeatedCommit]));

    expect(error).toBeInstanceOf(HistoryInvariantError);
    expect(error).toMatchObject({
      name: "HistoryInvariantError",
      code: "DUPLICATE_COMMIT_SHA",
      observationIndex: 1,
      commitSha: "commit-0",
    });
  });
});
