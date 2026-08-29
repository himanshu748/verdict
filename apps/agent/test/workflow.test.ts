import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../../../.github/workflows/verdict-day4-proof.yml", import.meta.url),
  "utf8",
);

describe("approved proof workflow", () => {
  it("binds every dispatch and proof path to the host approval nonce", () => {
    expect(workflow).toContain(
      "run-name: Verdict proof ${{ inputs.approval_nonce }}",
    );
    expect(workflow).toContain("approval_nonce:");
    expect(workflow).toContain(
      "PROOF_BRANCH: verdict/proof-${{ github.run_id }}-${{ github.run_attempt }}-${{ inputs.approval_nonce }}",
    );
    expect(workflow).toContain(
      "approvalNonce: process.env.APPROVAL_NONCE",
    );
  });

  it("runs repository code with read-only permissions and no persisted credential", () => {
    const verifyJob =
      workflow.split("  verify:\n")[1]?.split("  publish-proof:\n")[0] ?? "";

    expect(workflow).toContain("permissions: {}");
    expect(verifyJob).toContain(
      "if: github.ref == 'refs/heads/main' && github.run_attempt == 1",
    );
    expect(verifyJob).toContain("contents: read");
    expect(verifyJob).toContain(
      "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
    );
    expect(verifyJob.indexOf("- name: Enable Corepack")).toBeLessThan(
      verifyJob.indexOf("- name: Use Node.js"),
    );
    expect(verifyJob).not.toContain("cache: pnpm");
    expect(verifyJob).toContain("ref: ${{ github.sha }}");
    expect(verifyJob).toContain("persist-credentials: false");
    expect(verifyJob).toContain("pnpm install --frozen-lockfile --ignore-scripts");
    expect(verifyJob).toContain(
      "pnpm --silent --filter @verdict/agent verify:runtime-evidence",
    );
    expect(verifyJob).toContain("runtime_evidence_git_blob_sha");
    expect(verifyJob).not.toContain("contents: write");
  });

  it("isolates publication from checkout, dependencies and repository code", () => {
    const publishJob = workflow.split("  publish-proof:\n")[1] ?? "";

    expect(publishJob).toContain(
      "if: needs.verify.result == 'success' && github.run_attempt == 1",
    );
    expect(publishJob).toContain("needs: verify");
    expect(publishJob).toContain("contents: write");
    expect(publishJob).toContain("pull-requests: write");
    expect(publishJob).toContain("gh api");
    expect(publishJob).not.toContain("actions/checkout");
    expect(publishJob).not.toContain("pnpm install");
    expect(publishJob).not.toMatch(/^\s+run:\s+pnpm/m);
  });

  it("labels the artifact honestly and never asserts approval provenance itself", () => {
    expect(workflow).toContain('kind: "VERDICT_WORKFLOW_PROOF"');
    expect(workflow).toContain("runtimeReproducedByThisWorkflow: false");
    expect(workflow).toContain("externalRuntimeEvidence,");
    expect(workflow).toContain("RUNTIME_EVIDENCE_CANONICAL_SHA256");
    expect(workflow).not.toContain("sourceIssueRuntimeReproduced");
    expect(workflow).not.toContain("TRUEFORGE_APPROVED_WORKFLOW_DISPATCH");
    expect(workflow).not.toContain("after an explicit TrueForge approval");
  });
});
