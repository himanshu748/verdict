import { describe, expect, it } from "vitest";
import * as session from "../src/session.js";
import type {
  InvestigationTarget,
  WorkflowDispatchTarget,
} from "../src/session.js";

type RunConfig = {
  investigationTarget: InvestigationTarget;
  workflowTarget: WorkflowDispatchTarget;
};

type BuildRunConfig = (
  env: NodeJS.ProcessEnv,
  createApprovalNonce?: () => string,
) => RunConfig;
type ParseDecision = (input: string) => "approve" | "deny";

function candidateBuilder(): BuildRunConfig | undefined {
  return (
    session as unknown as { buildVerdictRunConfig?: BuildRunConfig }
  ).buildVerdictRunConfig;
}

function candidateDecisionParser(): ParseDecision | undefined {
  return (
    session as unknown as { parseVerdictDecision?: ParseDecision }
  ).parseVerdictDecision;
}

const validEnv: NodeJS.ProcessEnv = {
  VERDICT_ISSUE_NUMBER: "417",
  VERDICT_ISSUE_REPOSITORY: "truefoundry/trueforge",
  VERDICT_WORKFLOW_ID: "verdict-day4-proof.yml",
  VERDICT_WORKFLOW_OWNER: "himanshu748",
  VERDICT_WORKFLOW_REF: "main",
  VERDICT_WORKFLOW_REPO: "verdict",
};

describe("Verdict run configuration", () => {
  it("builds separate investigation and host-owned workflow targets", () => {
    expect(
      candidateBuilder()?.(
        validEnv,
        () => "0123456789abcdef0123456789abcdef",
      ),
    ).toEqual({
      investigationTarget: {
        issueNumber: 417,
        repository: "truefoundry/trueforge",
      },
      workflowTarget: {
        approvalNonce: "0123456789abcdef0123456789abcdef",
        owner: "himanshu748",
        ref: "main",
        repo: "verdict",
        workflowId: "verdict-day4-proof.yml",
      },
    });
  });

  it("rejects a malformed generated approval nonce", () => {
    expect(() => candidateBuilder()?.(validEnv, () => "predictable")).toThrow(
      "approval nonce",
    );
  });

  it.each([
    "VERDICT_ISSUE_REPOSITORY",
    "VERDICT_ISSUE_NUMBER",
    "VERDICT_WORKFLOW_OWNER",
    "VERDICT_WORKFLOW_REPO",
    "VERDICT_WORKFLOW_ID",
    "VERDICT_WORKFLOW_REF",
  ])("rejects missing required configuration %s", (field) => {
    const env = { ...validEnv };
    delete env[field];

    expect(() => candidateBuilder()?.(env)).toThrow(`${field} is required`);
  });

  it.each(["0", "1.5", "not-a-number"])(
    "rejects invalid issue number %s",
    (issueNumber) => {
      expect(() =>
        candidateBuilder()?.({
          ...validEnv,
          VERDICT_ISSUE_NUMBER: issueNumber,
        }),
      ).toThrow("VERDICT_ISSUE_NUMBER must be a positive integer");
    },
  );
});

describe("Verdict operator decision", () => {
  it("accepts only the exact approval phrase", () => {
    expect(candidateDecisionParser()?.("APPROVE VERDICT WORKFLOW")).toBe(
      "approve",
    );
  });

  it("accepts an explicit denial", () => {
    expect(candidateDecisionParser()?.("DENY")).toBe("deny");
  });

  it.each(["yes", "approve", "APPROVE VERDICT WORKFLOW now", ""])(
    "rejects ambiguous decision %j",
    (input) => {
      expect(() => candidateDecisionParser()?.(input)).toThrow(
        "APPROVE VERDICT WORKFLOW or DENY",
      );
    },
  );
});
