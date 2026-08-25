import { describe, expect, it } from "vitest";
import { classifyBoundary, type HistoryObservation } from "../src/index.js";

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
});
