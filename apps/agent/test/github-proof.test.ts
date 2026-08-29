import { readFileSync } from "node:fs";
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
const runtimeEvidenceBlobSha = "d".repeat(40);
const sourceIssue = "https://github.com/truefoundry/trueforge/issues/417";
const runtimeEvidencePath = "evidence/trueforge-417/reproduction.json";
const runtimeEvidenceContent = readFileSync(
  new URL(`../../../${runtimeEvidencePath}`, import.meta.url),
  "utf8",
);
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
    schemaVersion: 2,
    kind: "VERDICT_WORKFLOW_PROOF",
    evidenceMode: "INTEGRATION_PROOF",
    approvalNonce,
    sourceIssue,
    runtimeReproducedByThisWorkflow: false,
    externalRuntimeEvidence: {
      path: runtimeEvidencePath,
      repositoryCommit: dispatchCommitSha,
      gitBlobSha: runtimeEvidenceBlobSha,
      canonicalSha256:
        "a8bb5dd22e083782bd7782fccb0a1343b59fc77ea8525b6358fecc9b5b8baffa",
      verdict: "REPRODUCED",
      trueForgeSessionId: "01m16a555jy0b09pp9ze5296ng",
      hunterThreadId: "8ed4cc99-7c90-48df-bc39-f237c55761af",
      sourceManifestId: "trueforge-417-v1",
      provider: "@truefoundry/trueforge-core@0.1.4#DaytonaSandboxProvider",
      stalledRuns: 10,
      responsiveControls: 10,
    },
    verificationCommand: "pnpm turbo run test --filter=@verdict/agent",
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
    jsonResponse({
      type: "file",
      path: runtimeEvidencePath,
      sha: runtimeEvidenceBlobSha,
      encoding: "base64",
      content: Buffer.from(runtimeEvidenceContent).toString("base64"),
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
      "https://api.github.com/repos/himanshu748/verdict/actions/workflows/verdict-day4-proof.yml/runs?branch=main&event=workflow_dispatch&per_page=100",
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

  it("captures every baseline page before approval", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      workflowRun({ id: index + 1, display_title: `Existing run ${index + 1}` }),
    );
    const responses = [
      jsonResponse({ workflow_runs: firstPage }),
      jsonResponse({ workflow_runs: [workflowRun({ id: 202 })] }),
      jsonResponse({ object: { type: "commit", sha: dispatchCommitSha } }),
    ];
    const fetchImpl = vi.fn(async () => responses.shift()!);

    const captured = await captureWorkflowRunBaseline(token, target, fetchImpl);

    expect(captured.runIds.size).toBe(101);
    expect(captured.runIds.has(1)).toBe(true);
    expect(captured.runIds.has(202)).toBe(true);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://api.github.com/repos/himanshu748/verdict/actions/workflows/verdict-day4-proof.yml/runs?branch=main&event=workflow_dispatch&per_page=100&page=2",
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
        runtimeReproducedByThisWorkflow: false,
        externalRuntimeEvidence: {
          path: runtimeEvidencePath,
          repositoryCommit: dispatchCommitSha,
          gitBlobSha: runtimeEvidenceBlobSha,
          canonicalSha256:
            "a8bb5dd22e083782bd7782fccb0a1343b59fc77ea8525b6358fecc9b5b8baffa",
          verdict: "REPRODUCED",
          trueForgeSessionId: "01m16a555jy0b09pp9ze5296ng",
          hunterThreadId: "8ed4cc99-7c90-48df-bc39-f237c55761af",
          sourceManifestId: "trueforge-417-v1",
          provider:
            "@truefoundry/trueforge-core@0.1.4#DaytonaSandboxProvider",
          stalledRuns: 10,
          responsiveControls: 10,
        },
        verificationOutcome: "PASSED",
      },
    });
    expect(sleep).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenLastCalledWith(
      `https://api.github.com/repos/himanshu748/verdict/contents/${runtimeEvidencePath}?ref=${dispatchCommitSha}`,
      expect.any(Object),
    );
  });

  it("retries a transient GitHub proof read failure", async () => {
    const responses = successfulProofResponses();
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockImplementation(async () => responses.shift()!);
    const sleep = vi.fn(async () => undefined);

    const proof = await confirmWorkflowProof(
      token,
      target,
      baseline,
      sourceIssue,
      {
        fetchImpl,
        maxPolls: 1,
        maxReadAttempts: 3,
        pollIntervalMs: 1,
        readRetryDelayMs: 10,
        sleep,
      },
    );

    expect(proof.workflowRun.id).toBe(202);
    expect(fetchImpl).toHaveBeenCalledTimes(7);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(10);
  });

  it("does not replay approval while retrying post-approval reads", async () => {
    const responses: Array<Response | Error> = [
      jsonResponse({ workflow_runs: [workflowRun({ id: 101 })] }),
      jsonResponse({ object: { type: "commit", sha: dispatchCommitSha } }),
      new TypeError("fetch failed"),
      ...successfulProofResponses(),
    ];
    const fetchImpl = vi.fn(async () => {
      const response = responses.shift()!;
      if (response instanceof Error) {
        throw response;
      }
      return response;
    });
    const approve = vi.fn(async () => ({ status: "done" }));
    const sleep = vi.fn(async () => undefined);

    const result = await executeApprovedWorkflowWithProof(
      token,
      target,
      sourceIssue,
      approve,
      {
        fetchImpl,
        maxPolls: 1,
        maxReadAttempts: 2,
        pollIntervalMs: 1,
        readRetryDelayMs: 10,
        sleep,
      },
    );

    expect(approve).toHaveBeenCalledOnce();
    expect(result.proof.workflowRun.id).toBe(202);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(10);
  });

  it("retries a transient GitHub response status", async () => {
    const retryableResponse = jsonResponse({}, 503);
    const cancelBody = vi.spyOn(retryableResponse.body!, "cancel");
    const responses = [retryableResponse, ...successfulProofResponses()];
    const fetchImpl = vi.fn(async () => responses.shift()!);
    const sleep = vi.fn(async () => undefined);

    const proof = await confirmWorkflowProof(
      token,
      target,
      baseline,
      sourceIssue,
      {
        fetchImpl,
        maxPolls: 1,
        maxReadAttempts: 2,
        pollIntervalMs: 1,
        readRetryDelayMs: 10,
        sleep,
      },
    );

    expect(proof.workflowRun.id).toBe(202);
    expect(fetchImpl).toHaveBeenCalledTimes(7);
    expect(cancelBody).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledExactlyOnceWith(10);
  });

  it("continues retrying when intermediate response cleanup fails", async () => {
    const retryableResponse = jsonResponse({}, 503);
    const cancelBody = vi
      .spyOn(retryableResponse.body!, "cancel")
      .mockRejectedValueOnce(new Error("cancel failed"));
    const responses = [retryableResponse, ...successfulProofResponses()];
    const fetchImpl = vi.fn(async () => responses.shift()!);
    const sleep = vi.fn(async () => undefined);

    const proof = await confirmWorkflowProof(
      token,
      target,
      baseline,
      sourceIssue,
      {
        fetchImpl,
        maxPolls: 1,
        maxReadAttempts: 2,
        pollIntervalMs: 1,
        readRetryDelayMs: 10,
        sleep,
      },
    );

    expect(proof.workflowRun.id).toBe(202);
    expect(cancelBody).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledExactlyOnceWith(10);
  });

  it("releases the final retryable response during normal HTTP handling", async () => {
    const finalResponse = jsonResponse({}, 503);
    const cancelBody = vi.spyOn(finalResponse.body!, "cancel");
    const fetchImpl = vi.fn(async () => finalResponse);

    await expect(
      confirmWorkflowProof(token, target, baseline, sourceIssue, {
        fetchImpl,
        maxPolls: 1,
        maxReadAttempts: 1,
        pollIntervalMs: 1,
      }),
    ).rejects.toThrow("GitHub API request failed with HTTP 503");
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(cancelBody).toHaveBeenCalledOnce();
  });

  it("does not retry a non-transient GitHub response", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 403));
    const sleep = vi.fn(async () => undefined);

    await expect(
      confirmWorkflowProof(token, target, baseline, sourceIssue, {
        fetchImpl,
        maxPolls: 1,
        maxReadAttempts: 3,
        pollIntervalMs: 1,
        readRetryDelayMs: 10,
        sleep,
      }),
    ).rejects.toThrow("GitHub API request failed with HTTP 403");
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("stops after the bounded GitHub read retry budget", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const sleep = vi.fn(async () => undefined);

    await expect(
      confirmWorkflowProof(token, target, baseline, sourceIssue, {
        fetchImpl,
        maxPolls: 1,
        maxReadAttempts: 3,
        pollIntervalMs: 1,
        readRetryDelayMs: 10,
        sleep,
      }),
    ).rejects.toThrow("fetch failed");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 10);
    expect(sleep).toHaveBeenNthCalledWith(2, 20);
  });

  it("caps every exponential GitHub read delay at sixty seconds", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const sleep = vi.fn(async () => undefined);

    await expect(
      confirmWorkflowProof(token, target, baseline, sourceIssue, {
        fetchImpl,
        maxPolls: 1,
        maxReadAttempts: 5,
        pollIntervalMs: 1,
        readRetryDelayMs: 60_000,
        sleep,
      }),
    ).rejects.toThrow("fetch failed");
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(sleep).toHaveBeenCalledTimes(4);
    for (const call of sleep.mock.calls) {
      expect(call).toEqual([60_000]);
    }
  });

  it("keeps polling a candidate after newer runs push it to another page", async () => {
    const unrelatedRuns = Array.from({ length: 100 }, (_, index) =>
      workflowRun({
        id: 300 + index,
        display_title: `Unrelated run ${index + 1}`,
      }),
    );
    const responses = [
      jsonResponse({ workflow_runs: [workflowRun()] }),
      jsonResponse({ workflow_runs: unrelatedRuns }),
      jsonResponse({
        workflow_runs: [
          workflowRun({ status: "completed", conclusion: "success" }),
        ],
      }),
      ...successfulProofResponses().slice(1),
    ];
    const fetchImpl = vi.fn(async () => responses.shift()!);

    const proof = await confirmWorkflowProof(
      token,
      target,
      baseline,
      sourceIssue,
      { fetchImpl, maxPolls: 2, pollIntervalMs: 1 },
    );

    expect(proof.workflowRun.id).toBe(202);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      "https://api.github.com/repos/himanshu748/verdict/actions/workflows/verdict-day4-proof.yml/runs?branch=main&event=workflow_dispatch&per_page=100&page=2",
      expect.any(Object),
    );
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
        JSON.stringify(proofDocument({ runtimeReproducedByThisWorkflow: true })),
      ).toString("base64"),
    });
    const fetchImpl = vi.fn(async () => responses.shift()!);

    await expect(
      confirmWorkflowProof(token, target, baseline, sourceIssue, {
        fetchImpl,
        maxPolls: 1,
        pollIntervalMs: 1,
      }),
    ).rejects.toThrow("runtimeReproducedByThisWorkflow");
  });

  it("rejects a runtime evidence response that is not the claimed Git blob", async () => {
    const responses = successfulProofResponses();
    responses[5] = jsonResponse({
      type: "file",
      path: runtimeEvidencePath,
      sha: "e".repeat(40),
      encoding: "base64",
      content: Buffer.from(runtimeEvidenceContent).toString("base64"),
    });
    const fetchImpl = vi.fn(async () => responses.shift()!);

    await expect(
      confirmWorkflowProof(token, target, baseline, sourceIssue, {
        fetchImpl,
        maxPolls: 1,
        pollIntervalMs: 1,
      }),
    ).rejects.toThrow("runtime evidence Git blob");
  });

  it("rejects runtime evidence whose canonical digest no longer matches", async () => {
    const responses = successfulProofResponses();
    const tamperedEvidence = JSON.parse(runtimeEvidenceContent) as Record<
      string,
      unknown
    >;
    tamperedEvidence.capturedAt = "2026-08-29T09:00:00.000Z";
    responses[5] = jsonResponse({
      type: "file",
      path: runtimeEvidencePath,
      sha: runtimeEvidenceBlobSha,
      encoding: "base64",
      content: Buffer.from(JSON.stringify(tamperedEvidence)).toString("base64"),
    });
    const fetchImpl = vi.fn(async () => responses.shift()!);

    await expect(
      confirmWorkflowProof(token, target, baseline, sourceIssue, {
        fetchImpl,
        maxPolls: 1,
        pollIntervalMs: 1,
      }),
    ).rejects.toThrow("canonical SHA-256");
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
