import type {
  ApprovedWorkflowProofResult,
  ConfirmedWorkflowProof,
} from "./github-proof.js";
import type { VerdictEventProjection } from "./session.js";

const MAX_APPROVED_WORKFLOW_DISPATCHES = 1;

export type ApprovalTurnDecision = "approve" | "deny";

export interface ApprovalTurnHandlers {
  approve: (
    projection: VerdictEventProjection,
  ) => Promise<ApprovedWorkflowProofResult<VerdictEventProjection>>;
  decide: (
    projection: VerdictEventProjection,
  ) => Promise<ApprovalTurnDecision>;
  deny: (
    projection: VerdictEventProjection,
    reason?: string,
  ) => Promise<VerdictEventProjection>;
}

export interface ApprovalTurnResolution {
  confirmedWorkflowProofs: ConfirmedWorkflowProof[];
  projection: VerdictEventProjection;
}

export async function resolveApprovalTurns(
  initialProjection: VerdictEventProjection,
  handlers: ApprovalTurnHandlers,
): Promise<ApprovalTurnResolution> {
  const confirmedWorkflowProofs: ConfirmedWorkflowProof[] = [];
  const decidedTurnIds = new Set<string>();
  let projection = initialProjection;

  while (projection.status === "approval_required") {
    if (
      confirmedWorkflowProofs.length >= MAX_APPROVED_WORKFLOW_DISPATCHES
    ) {
      const deniedProjection = await handlers.deny(
        projection,
        "Verdict policy denied a repeated workflow dispatch after one confirmed proof.",
      );
      projection = {
        ...deniedProjection,
        error:
          "Verdict cannot request more than one approved workflow dispatch per investigation.",
        status: "error",
      };
      break;
    }
    if (!projection.turnId) {
      throw new Error("An approval decision requires the exact paused turn id.");
    }
    if (decidedTurnIds.has(projection.turnId)) {
      throw new Error("The approval loop received an already decided paused turn.");
    }
    decidedTurnIds.add(projection.turnId);

    const decision = await handlers.decide(projection);
    if (decision === "approve") {
      const approved = await handlers.approve(projection);
      projection = approved.approvalResult;
      confirmedWorkflowProofs.push(approved.proof);
    } else {
      projection = await handlers.deny(projection);
    }
  }

  return { confirmedWorkflowProofs, projection };
}
