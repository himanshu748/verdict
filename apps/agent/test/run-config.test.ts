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
  VERDICT_SOURCE_MANIFEST_ID: "trueforge-417-v1",
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
        sourceManifestId: "trueforge-417-v1",
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

  it("rejects a proof workflow ref other than main", () => {
    expect(() =>
      candidateBuilder()?.({
        ...validEnv,
        VERDICT_WORKFLOW_REF: "release",
      }),
    ).toThrow("VERDICT_WORKFLOW_REF must be main");
  });

  it.each([
    "VERDICT_ISSUE_REPOSITORY",
    "VERDICT_ISSUE_NUMBER",
    "VERDICT_SOURCE_MANIFEST_ID",
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

  it("rejects an unknown source manifest", () => {
    expect(() =>
      candidateBuilder()?.({
        ...validEnv,
        VERDICT_SOURCE_MANIFEST_ID: "trueforge-417-unreviewed",
      }),
    ).toThrow("Unknown VERDICT_SOURCE_MANIFEST_ID");
  });

  it("rejects a repository that does not match the manifest", () => {
    expect(() =>
      candidateBuilder()?.({
        ...validEnv,
        VERDICT_ISSUE_REPOSITORY: "someone/fork",
      }),
    ).toThrow("VERDICT_ISSUE_REPOSITORY must match");
  });

  it("rejects an issue that does not match the manifest", () => {
    expect(() =>
      candidateBuilder()?.({
        ...validEnv,
        VERDICT_ISSUE_NUMBER: "418",
      }),
    ).toThrow("VERDICT_ISSUE_NUMBER must match");
  });

  it("ignores obsolete independent source fields", () => {
    expect(
      candidateBuilder()?.(
        {
          ...validEnv,
          VERDICT_SOURCE_COMMIT: "0000000000000000000000000000000000000000",
          VERDICT_SOURCE_PACKAGE: "@truefoundry/trueforge-core@latest",
          VERDICT_SOURCE_PACKAGE_INTEGRITY: "sha512-untrusted",
        },
        () => "0123456789abcdef0123456789abcdef",
      ).investigationTarget,
    ).toEqual({
      issueNumber: 417,
      repository: "truefoundry/trueforge",
      sourceManifestId: "trueforge-417-v1",
    });
  });
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
