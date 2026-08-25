import { classifyBoundary, classifyReproduction } from "@verdict/protocol";
import { describe, expect, it } from "vitest";
import { demoCase, renderDemoReport } from "../lib/demo-case";

describe("simulated TrueForge #417 case", () => {
  it("derives every visible matrix state from protocol run records", () => {
    for (const condition of demoCase.conditions) {
      expect(classifyReproduction(condition.records, demoCase.contract.threshold)).toEqual(
        condition.result,
      );
    }
  });

  it("pins the selected condition only from ten matching valid observations", () => {
    expect(demoCase.selectedResult).toEqual({
      state: "REPRODUCTION_PINNED",
      matched: 10,
      observed: 10,
      unresolved: 0,
      requiredValidRuns: 10,
    });
  });

  it("keeps untested commits visible as a boundary range", () => {
    expect(classifyBoundary(demoCase.history)).toEqual({
      state: "BOUNDARY_RANGE",
      goodCommit: "f29d9abb317c34326c2db782fc45c1edfe9bf039",
      badCommit: "69237db843c2951d30335b1763e31b869be7fe88",
    });
  });

  it("renders an honest report with no public write claim", () => {
    const report = renderDemoReport();
    expect(report).toContain("REPRODUCTION_PINNED");
    expect(report).toContain("No public write has occurred");
    expect(report).toContain(demoCase.boundary.badCommit);
  });
});
