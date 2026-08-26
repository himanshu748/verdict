import { classifyBoundary, classifyReproduction } from "@verdict/protocol";
import { describe, expect, it } from "vitest";
import { demoCase, renderDemoReport } from "../lib/demo-case";
import { sampleExposures } from "../lib/sample-case";

describe("conceptual TrueForge #417 demo fixture", () => {
  it("derives every visible matrix state from protocol run records", () => {
    for (const condition of demoCase.conditions) {
      expect(classifyReproduction(condition.records, demoCase.contract.threshold)).toEqual(
        condition.result,
      );
      for (const record of condition.records) {
        expect(record.environment.EVIDENCE_MODE).toBe("CONCEPTUAL_SIMULATION");
        expect(record.environment.EXECUTION_STATUS).toBe("NOT_RUN");
        expect(record.environment.FIXTURE_STATUS).toBe("PROPOSED_NOT_IMPLEMENTED");
        expect(record.environment.VERDICT_REQUEST_BUDGET_MS).toBe(
          String(condition.requestBudgetMs),
        );
        expect(record.environment.VERDICT_UPSTREAM_BEHAVIOR).toBe(
          condition.upstreamBehavior,
        );
        expect(record.command).toContain(
          `VERDICT_REQUEST_BUDGET_MS=${condition.requestBudgetMs}`,
        );
        expect(record.command).toContain(
          `VERDICT_UPSTREAM_BEHAVIOR=${condition.upstreamBehavior}`,
        );
        expect(record.outputExcerpt).toMatch(/^SIMULATED FIXTURE:/);
      }
    }
  });

  it("models a pinned result from ten matching generated records", () => {
    expect(demoCase.evidenceMode).toBe("CONCEPTUAL_SIMULATION");
    expect(demoCase.executionStatus).toBe("NOT_RUN");
    expect(demoCase.selectedResult).toEqual({
      state: "REPRODUCTION_PINNED",
      matched: 10,
      observed: 10,
      unresolved: 0,
      requiredValidRuns: 10,
    });
  });

  it("maps each interactive exposure to its own proposed command", () => {
    for (const exposure of sampleExposures) {
      const condition = demoCase.conditions.find((item) => item.id === exposure.id);

      expect(condition).toBeDefined();
      expect(exposure.command).toBe(condition?.records[0]?.command);
      expect(exposure.command).toContain(
        `VERDICT_REQUEST_BUDGET_MS=${condition?.requestBudgetMs}`,
      );
      expect(exposure.command).toContain(
        `VERDICT_UPSTREAM_BEHAVIOR=${condition?.upstreamBehavior}`,
      );
    }
  });

  it("keeps the static-diff suspect separate from runtime polarity", () => {
    expect(classifyBoundary(demoCase.history)).toEqual({
      state: "UNRESOLVED",
      goodCommit: null,
      badCommit: null,
    });
    expect(demoCase.suspectRange).toMatchObject({
      state: "STATIC_DIFF_SUSPECT_RANGE",
      immediateParentCommit: "f7a0a181a87e025c925f2cbe604e164db99323d5",
      suspectCommit: "69237db843c2951d30335b1763e31b869be7fe88",
      runtimePolarity: "NOT_ESTABLISHED",
    });
    expect(demoCase.history.every((entry) => entry.outcome === "UNRESOLVED")).toBe(true);
  });

  it("documents a plausible Jest plan without claiming it ran", () => {
    const selectedCondition = demoCase.conditions.find(
      (condition) => condition.id === demoCase.selectedConditionId,
    );

    expect(selectedCondition).toBeDefined();
    expect(demoCase.contract.commandStatus).toBe("NOT_RUN");
    expect(demoCase.contract.fixtureStatus).toBe("PROPOSED_NOT_IMPLEMENTED");
    expect(demoCase.testPlan).toMatchObject({
      status: "NOT_RUN",
      fixtureStatus: "PROPOSED_NOT_IMPLEMENTED",
      path: "packages/trueforge-core/tests/core/sandbox/daytonaSnapshotRegistration.test.ts",
    });
    expect(demoCase.contract.command).toBe(selectedCondition?.records[0]?.command);
    expect(demoCase.testPlan.command).toBe(demoCase.contract.command);
    expect(demoCase.testPlan.command).toContain("VERDICT_REQUEST_BUDGET_MS=750");
    expect(demoCase.testPlan.command).toContain("VERDICT_UPSTREAM_BEHAVIOR=NO_RESPONSE");
    expect(demoCase.testPlan.command).toContain("@truefoundry/trueforge-core test");
    expect(demoCase.testPlan.command).toContain(
      "tests/core/sandbox/daytonaSnapshotRegistration.test.ts",
    );
    expect(demoCase.testPlan.command).not.toContain("vitest");
    expect(demoCase.testPlan.command).not.toContain("test/daytona-timeout.test.ts");
  });

  it("renders an honest conceptual report with no public write claim", () => {
    const report = renderDemoReport();
    expect(report).toContain("Evidence mode: conceptual simulation");
    expect(report).toContain("Execution status: not run");
    expect(report).toContain("Runtime polarity: not established");
    expect(report).toContain("No publication workflow is configured");
    expect(report).toContain("No public write has occurred");
    expect(report).toContain(demoCase.suspectRange.immediateParentCommit);
    expect(report).toContain(demoCase.suspectRange.suspectCommit);
    expect(report).not.toContain("Last demonstrated good");
    expect(report).not.toContain("First demonstrated bad");
    expect(demoCase.publication).toMatchObject({
      status: "NOT_CONFIGURED",
      branchStatus: "PROPOSED",
      workflowStatus: "PROPOSED_NOT_PRESENT",
    });
  });
});
