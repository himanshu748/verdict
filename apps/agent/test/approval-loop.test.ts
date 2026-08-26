import { describe, expect, it, vi } from "vitest";
import type { ConfirmedWorkflowProof } from "../src/github-proof.js";
import { resolveApprovalTurns } from "../src/approval-loop.js";
import type { VerdictEventProjection } from "../src/session.js";

function projection(
  turnId: string,
  status: VerdictEventProjection["status"],
): VerdictEventProjection {
  return {
    assistantText: "",
    error: null,
    modelToolCalls: [],
    pendingApprovals: [],
    sessionId: "session-1",
    status,
    threads: [],
    turnId,
  };
}

function proof(id: number): ConfirmedWorkflowProof {
  return {
    workflowRun: {
      attempt: 1,
      commitSha: "a".repeat(40),
      conclusion: "success",
      id,
      url: `https://github.com/himanshu748/verdict/actions/runs/${id}`,
    },
    draftPullRequest: {
      baseRef: "main",
      headRef: `verdict/proof-${id}`,
      headSha: "b".repeat(40),
      number: id,
      url: `https://github.com/himanshu748/verdict/pull/${id}`,
    },
    proofArtifact: {
      approvalNonce: "0123456789abcdef0123456789abcdef",
      blobSha: "c".repeat(40),
      path: `.verdict/proofs/run-${id}.json`,
      sourceIssue: "https://github.com/truefoundry/trueforge/issues/417",
      sourceIssueRuntimeReproduced: false,
      verificationOutcome: "PASSED",
    },
  };
}

describe("approval turn loop", () => {
  it("handles every sequential approval until the investigation is done", async () => {
    const first = projection("turn-1", "approval_required");
    const second = projection("turn-2", "approval_required");
    const done = projection("turn-3", "done");
    const decide = vi.fn(async () => "approve" as const);
    const approve = vi
      .fn()
      .mockResolvedValueOnce({ approvalResult: second, proof: proof(201) })
      .mockResolvedValueOnce({ approvalResult: done, proof: proof(202) });
    const deny = vi.fn();

    const result = await resolveApprovalTurns(first, {
      approve,
      decide,
      deny,
    });

    expect(decide).toHaveBeenCalledTimes(2);
    expect(approve).toHaveBeenNthCalledWith(1, first);
    expect(approve).toHaveBeenNthCalledWith(2, second);
    expect(deny).not.toHaveBeenCalled();
    expect(result.projection).toBe(done);
    expect(result.confirmedWorkflowProofs.map((item) => item.workflowRun.id)).toEqual([
      201,
      202,
    ]);
  });

  it("continues after a denial if TrueForge later requests another decision", async () => {
    const first = projection("turn-1", "approval_required");
    const second = projection("turn-2", "approval_required");
    const done = projection("turn-3", "done");
    const decide = vi
      .fn()
      .mockResolvedValueOnce("deny")
      .mockResolvedValueOnce("approve");
    const deny = vi.fn(async () => second);
    const approve = vi.fn(async () => ({
      approvalResult: done,
      proof: proof(202),
    }));

    const result = await resolveApprovalTurns(first, {
      approve,
      decide,
      deny,
    });

    expect(deny).toHaveBeenCalledWith(first);
    expect(approve).toHaveBeenCalledWith(second);
    expect(result.projection).toBe(done);
    expect(result.confirmedWorkflowProofs).toHaveLength(1);
  });

  it("fails closed before a third approved dispatch can be requested", async () => {
    const first = projection("turn-1", "approval_required");
    const second = projection("turn-2", "approval_required");
    const third = projection("turn-3", "approval_required");
    const decide = vi.fn(async () => "approve" as const);
    const approve = vi
      .fn()
      .mockResolvedValueOnce({ approvalResult: second, proof: proof(201) })
      .mockResolvedValueOnce({ approvalResult: third, proof: proof(202) });

    await expect(
      resolveApprovalTurns(first, { approve, decide, deny: vi.fn() }),
    ).rejects.toThrow("more than two approved workflow dispatches");
    expect(decide).toHaveBeenCalledTimes(2);
    expect(approve).toHaveBeenCalledTimes(2);
  });
});
