import { describe, expect, it, vi } from "vitest";
import {
  captureWorkflowRunBaseline,
  confirmWorkflowProof,
  executeApprovedWorkflowWithProof,
} from "../src/github-proof.js";
import type { WorkflowDispatchTarget } from "../src/session.js";

const approvalNonce = "0123456789abcdef0123456789abcdef";
const dispatchCommitSha = "a".repeat(40);
const proofCommitSha = "b".repeat(40);
const proofBlobSha = "c".repeat(40);
const sourceIssue = "https://github.com/truefoundry/trueforge/issues/417";
const token = ["github", "pat", "fixture"].join("_");
const target: WorkflowDispatchTarget = {
  approvalNonce,
  owner: "himanshu748",
  repo: "verdict",
  workflowId: "verdict-day4-proof.yml",
  ref: "main",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function workflowRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 202,
    run_attempt: 1,
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: dispatchCommitSha,
    display_title: `Verdict proof ${approvalNonce}`,
    status: "queued",
    conclusion: null,
    html_url: "https://github.com/himanshu748/verdict/actions/runs/202",
    ...overrides,
  };
}

function proofPath(): string {
  return `.verdict/proofs/run-202-1-${approvalNonce}.json`;
}

function proofDocument(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    kind: "VERDICT_WORKFLOW_PROOF",
    evidenceMode: "INTEGRATION_PROOF",
    approvalNonce,
    sourceIssue,
    sourceIssueRuntimeReproduced: false,
    verificationCommand: "pnpm --filter @verdict/agent test",
    verificationOutcome: "PASSED",
    workflow: "Verdict approved investigation proof",
    runId: 202,
    runAttempt: 1,
    commit: dispatchCommitSha,
    createdAt: "2026-08-26T12:00:00.000Z",
    ...overrides,
  };
}

function successfulProofResponses(): Response[] {
  return [
    jsonResponse({
      workflow_runs: [
        workflowRun({ status: "completed", conclusion: "success" }),
      ],
    }),
    jsonResponse([
      {
        number: 7,
        html_url: "https://github.com/himanshu748/verdict/pull/7",
        draft: true,
        head: { ref: `verdict/proof-202-1-${approvalNonce}`, sha: proofCommitSha },
        base: { ref: "main" },
      },
    ]),
    jsonResponse({
      status: "ahead",
      ahead_by: 1,
      total_commits: 1,
      commits: [{ sha: proofCommitSha }],
      files: [{ filename: proofPath(), status: "added", sha: proofBlobSha }],
    }),
    jsonResponse({
      sha: proofCommitSha,
      parents: [{ sha: dispatchCommitSha }],
    }),
    jsonResponse({
      encoding: "base64",
      content: Buffer.from(JSON.stringify(proofDocument())).toString("base64"),
    }),
  ];
}

const baseline = {
  runIds: new Set([101]),
  targetHeadSha: dispatchCommitSha,
};

describe("GitHub workflow proof verification", () => {
  it("captures run IDs and the exact target commit before approval", async () => {
    const responses = [
      jsonResponse({ workflow_runs: [workflowRun({ id: 101 }), workflowRun()] }),
      jsonResponse({ object: { type: "commit", sha: dispatchCommitSha } }),
    ];
    const fetchImpl = vi.fn(async () => responses.shift()!);

    const captured = await captureWorkflowRunBaseline(token, target, fetchImpl);

    expect(captured).toEqual({
      runIds: new Set([101, 202]),
      targetHeadSha: dispatchCommitSha,
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://api.github.com/repos/himanshu748/verdict/actions/workflows/verdict-day4-proof.yml/runs?branch=main&event=workflow_dispatch&per_page=20",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${token}` }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://api.github.com/repos/himanshu748/verdict/git/ref/heads/main",
      expect.any(Object),
    );
  });

  it("confirms the nonce-bound run, immutable proof commit and exact proof JSON", async () => {
    const responses = [
      jsonResponse({ workflow_runs: [workflowRun()] }),
      ...successfulProofResponses(),
    ];
    const fetchImpl = vi.fn(async () => responses.shift()!);
    const sleep = vi.fn(async () => undefined);

    const proof = await confirmWorkflowProof(
      token,
      target,
      baseline,
      sourceIssue,
      { fetchImpl, maxPolls: 3, pollIntervalMs: 1, sleep },
    );

    expect(proof).toEqual({
      workflowRun: {
        id: 202,
        attempt: 1,
        url: "https://github.com/himanshu748/verdict/actions/runs/202",
        conclusion: "success",
        commitSha: dispatchCommitSha,
      },
      draftPullRequest: {
        number: 7,
        url: "https://github.com/himanshu748/verdict/pull/7",
        headRef: `verdict/proof-202-1-${approvalNonce}`,
        headSha: proofCommitSha,
        baseRef: "main",
      },
      proofArtifact: {
        path: proofPath(),
        blobSha: proofBlobSha,
        approvalNonce,
        sourceIssue,
        sourceIssueRuntimeReproduced: false,
        verificationOutcome: "PASSED",
      },
    });
    expect(sleep).toHaveBeenCalledOnce();
  });

  it("ignores an unrelated manual dispatch with another nonce", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        workflow_runs: [
          workflowRun({
            id: 203,
            display_title: "Verdict proof unrelated-manual-dispatch",
            status: "completed",
            conclusion: "success",
          }),
        ],
      }),
    );

    await expect(
      confirmWorkflowProof(token, target, baseline, sourceIssue, {
        fetchImpl,
        maxPolls: 1,
        pollIntervalMs: 1,
      }),
    ).rejects.toThrow("Timed out waiting for the nonce-bound workflow run");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("fails closed when more than one nonce-bound run appears", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        workflow_runs: [workflowRun(), workflowRun({ id: 203 })],
      }),
    );

    await expect(
      confirmWorkflowProof(token, target, baseline, sourceIssue, {
        fetchImpl,
        maxPolls: 1,
        pollIntervalMs: 1,
      }),
    ).rejects.toThrow("More than one new nonce-bound workflow run appeared");
  });

  it("rejects a nonce-bound run that resolved a different commit", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        workflow_runs: [workflowRun({ head_sha: "d".repeat(40) })],
      }),
    );

    await expect(
      confirmWorkflowProof(token, target, baseline, sourceIssue, {
        fetchImpl,
        maxPolls: 1,
        pollIntervalMs: 1,
      }),
    ).rejects.toThrow("does not match the pre-approval target commit");
  });

  it("rejects a rerun because it was not created by a fresh approval", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        workflow_runs: [workflowRun({ run_attempt: 2 })],
      }),
    );

    await expect(
      confirmWorkflowProof(token, target, baseline, sourceIssue, {
        fetchImpl,
        maxPolls: 1,
        pollIntervalMs: 1,
      }),
    ).rejects.toThrow("first workflow attempt");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("reports a completed failed workflow without looking for a PR", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        workflow_runs: [
          workflowRun({ status: "completed", conclusion: "failure" }),
        ],
      }),
    );

    await expect(
      confirmWorkflowProof(token, target, baseline, sourceIssue, {
        fetchImpl,
        maxPolls: 1,
        pollIntervalMs: 1,
      }),
    ).rejects.toThrow("Workflow run 202 completed with conclusion failure");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects a draft PR whose proof JSON was tampered", async () => {
    const responses = successfulProofResponses();
    responses[4] = jsonResponse({
      encoding: "base64",
      content: Buffer.from(
        JSON.stringify(proofDocument({ sourceIssueRuntimeReproduced: true })),
      ).toString("base64"),
    });
    const fetchImpl = vi.fn(async () => responses.shift()!);

    await expect(
      confirmWorkflowProof(token, target, baseline, sourceIssue, {
        fetchImpl,
        maxPolls: 1,
        pollIntervalMs: 1,
      }),
    ).rejects.toThrow("sourceIssueRuntimeReproduced");
  });

  it("rejects a PR with extra changed files", async () => {
    const responses = successfulProofResponses();
    responses[2] = jsonResponse({
      status: "ahead",
      ahead_by: 1,
      total_commits: 1,
      commits: [{ sha: proofCommitSha }],
      files: [
        { filename: proofPath(), status: "added", sha: proofBlobSha },
        { filename: "README.md", status: "modified", sha: "d".repeat(40) },
      ],
    });
    const fetchImpl = vi.fn(async () => responses.shift()!);

    await expect(
      confirmWorkflowProof(token, target, baseline, sourceIssue, {
        fetchImpl,
        maxPolls: 1,
        pollIntervalMs: 1,
      }),
    ).rejects.toThrow("exactly one added proof file");
  });

  it("rejects proof files resolved from a different force-pushed head", async () => {
    const responses = successfulProofResponses();
    responses[2] = jsonResponse({
      status: "ahead",
      ahead_by: 1,
      total_commits: 1,
      commits: [{ sha: "d".repeat(40) }],
      files: [{ filename: proofPath(), status: "added", sha: proofBlobSha }],
    });
    const fetchImpl = vi.fn(async () => responses.shift()!);

    await expect(
      confirmWorkflowProof(token, target, baseline, sourceIssue, {
        fetchImpl,
        maxPolls: 1,
        pollIntervalMs: 1,
      }),
    ).rejects.toThrow("not pinned to the draft PR head");
  });

  it("captures the baseline before approval and returns only confirmed proof", async () => {
    const order: string[] = [];
    const responses = [
      jsonResponse({ workflow_runs: [workflowRun({ id: 101 })] }),
      jsonResponse({ object: { type: "commit", sha: dispatchCommitSha } }),
      ...successfulProofResponses(),
    ];
    const fetchImpl = vi.fn(async () => {
      order.push("read");
      return responses.shift()!;
    });
    const approve = vi.fn(async () => {
      order.push("approve");
      return { status: "done" };
    });

    const result = await executeApprovedWorkflowWithProof(
      token,
      target,
      sourceIssue,
      approve,
      { fetchImpl, maxPolls: 1, pollIntervalMs: 1 },
    );

    expect(order.slice(0, 3)).toEqual(["read", "read", "approve"]);
    expect(result.approvalResult).toEqual({ status: "done" });
    expect(result.proof.draftPullRequest.url).toBe(
      "https://github.com/himanshu748/verdict/pull/7",
    );
  });

  it("rejects non-fine-grained tokens before making a request", async () => {
    const fetchImpl = vi.fn();

    await expect(
      captureWorkflowRunBaseline("ghp_classic", target, fetchImpl),
    ).rejects.toThrow("fine-grained personal access token");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
