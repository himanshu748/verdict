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
  it("allows one approved workflow dispatch", async () => {
    const first = projection("turn-1", "approval_required");
    const done = projection("turn-2", "done");
    const decide = vi.fn(async () => "approve" as const);
    const approve = vi.fn().mockResolvedValue({
      approvalResult: done,
      proof: proof(201),
    });
    const deny = vi.fn();

    const result = await resolveApprovalTurns(first, {
      approve,
      decide,
      deny,
    });

    expect(decide).toHaveBeenCalledTimes(1);
    expect(approve).toHaveBeenNthCalledWith(1, first);
    expect(deny).not.toHaveBeenCalled();
    expect(result.projection).toBe(done);
    expect(result.confirmedWorkflowProofs.map((item) => item.workflowRun.id)).toEqual([
      201,
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

  it("fails closed before a second dispatch and preserves the audit result", async () => {
    const first = projection("turn-1", "approval_required");
    const second = projection("turn-2", "approval_required");
    const denied = {
      ...projection("turn-3", "cancelled"),
      assistantText: "First proof confirmed; repeated request denied.",
    };
    const decide = vi.fn(async () => "approve" as const);
    const approve = vi.fn().mockResolvedValueOnce({
      approvalResult: second,
      proof: proof(201),
    });
    const deny = vi.fn().mockResolvedValue(denied);

    const result = await resolveApprovalTurns(first, {
      approve,
      decide,
      deny,
    });
    expect(decide).toHaveBeenCalledTimes(1);
    expect(approve).toHaveBeenCalledTimes(1);
    expect(deny).toHaveBeenCalledWith(
      second,
      "Verdict policy denied a repeated workflow dispatch after one confirmed proof.",
    );
    expect(result.projection).toMatchObject({
      assistantText: "First proof confirmed; repeated request denied.",
      error:
        "Verdict cannot request more than one approved workflow dispatch per investigation.",
      status: "error",
      turnId: "turn-3",
    });
    expect(result.confirmedWorkflowProofs).toEqual([proof(201)]);
  });
});
