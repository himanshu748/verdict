import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { TrueForgeApi } from "@truefoundry/trueforge-sdk";
import { resolveApprovalTurns } from "./approval-loop.js";
import { createTrueForgeClientFromEnv } from "./client.js";
import {
  executeApprovedWorkflowWithProof,
  type ConfirmedWorkflowProof,
} from "./github-proof.js";
import {
  approveVerdictWorkflow,
  buildVerdictRunConfig,
  classifyMissingWorkflowApproval,
  denyVerdictApprovals,
  failMissingWorkflowApprovalAttempt,
  parseVerdictDecision,
  requestMissingWorkflowApproval,
  startVerdictInvestigation,
  type VerdictEventProjection,
} from "./session.js";
import { sanitizeTerminalField } from "./terminal.js";
import { startWithTransientProviderRetry } from "./transient-retry.js";

function printObservedEvent(
  projection: VerdictEventProjection,
  event: TrueForgeApi.TurnStreamingEvent,
): void {
  if (event.type === "thread.created") {
    console.log(
      `[subagent:start] ${sanitizeTerminalField(event.agentInfo.name)} (${sanitizeTerminalField(event.threadId)}) ${sanitizeTerminalField(event.title)}`,
    );
  } else if (event.type === "thread.done") {
    const thread = projection.threads.find(
      (candidate) => candidate.threadId === event.threadId,
    );
    console.log(
      `[subagent:${thread?.status ?? "done"}] ${sanitizeTerminalField(thread?.name ?? event.title)} (${sanitizeTerminalField(event.threadId)})`,
    );
  } else if (event.type === "tool.approval_required") {
    console.log(
      `[approval:required] ${event.toolCalls.length} tool call requires a maintainer decision`,
    );
  }
}

function printFinalProjection(
  projection: VerdictEventProjection,
  confirmedWorkflowProofs: readonly ConfirmedWorkflowProof[],
): void {
  console.log(
    JSON.stringify(
      {
        sessionId: projection.sessionId,
        turnId: projection.turnId,
        status: projection.status,
        observedSubagents: projection.threads.map((thread) => ({
          name: thread.name,
          status: thread.status,
          threadId: thread.threadId,
          title: thread.title,
        })),
        assistantText: projection.assistantText,
        error: projection.error,
        confirmedWorkflowProofs,
      },
      null,
      2,
    ),
  );
}

const config = buildVerdictRunConfig();
const sourceIssueUrl = `https://github.com/${config.investigationTarget.repository}/issues/${config.investigationTarget.issueNumber}`;
const client = createTrueForgeClientFromEnv();
const onProjection = (
  projection: VerdictEventProjection,
  event: TrueForgeApi.TurnStreamingEvent,
) => printObservedEvent(projection, event);

let projection = await startWithTransientProviderRetry(
  () =>
    startVerdictInvestigation(
      client,
      config.investigationTarget,
      config.workflowTarget,
      onProjection,
    ),
  {
    onRetry: ({ attempt, delayMs, maxAttempts }) => {
      console.error(
        `[retry:provider] transient pre-approval failure after attempt ${attempt}/${maxAttempts}; retrying in ${delayMs}ms`,
      );
    },
  },
);

const missingWorkflowApproval = classifyMissingWorkflowApproval(projection);
if (missingWorkflowApproval === "request_required") {
  projection = await requestMissingWorkflowApproval(
    client,
    projection,
    config.workflowTarget,
    onProjection,
  );
} else if (missingWorkflowApproval === "attempt_failed") {
  projection = failMissingWorkflowApprovalAttempt(projection);
}

let confirmedWorkflowProofs: ConfirmedWorkflowProof[] = [];

if (projection.status === "approval_required") {
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const resolved = await resolveApprovalTurns(projection, {
      decide: async (pendingProjection) => {
        const pending = pendingProjection.pendingApprovals[0];
        console.log(
          JSON.stringify(
            {
              decision: "PENDING",
              trustedWorkflowTarget: config.workflowTarget,
              proposedTool: pending?.toolCall
                ? {
                    functionName: pending.toolCall.functionName,
                    argumentsJson: pending.toolCall.argumentsJson,
                    serverName:
                      pending.toolCall.toolInfo?.type === "mcp"
                        ? pending.toolCall.toolInfo.serverName
                        : null,
                  }
                : null,
            },
            null,
            2,
          ),
        );
        const answer = await prompt.question(
          "Type APPROVE VERDICT WORKFLOW to allow the exact dispatch, or DENY: ",
        );
        return parseVerdictDecision(answer);
      },
      approve: (pendingProjection) =>
        executeApprovedWorkflowWithProof(
          process.env.GITHUB_TOKEN ?? "",
          config.workflowTarget,
          sourceIssueUrl,
          () =>
            approveVerdictWorkflow(
              client,
              pendingProjection,
              config.workflowTarget,
              onProjection,
            ),
        ),
      deny: (
        pendingProjection,
        reason = "Maintainer denied the proposed public write.",
      ) =>
        denyVerdictApprovals(
          client,
          pendingProjection,
          reason,
          onProjection,
        ),
    });
    projection = resolved.projection;
    confirmedWorkflowProofs = resolved.confirmedWorkflowProofs;
  } finally {
    prompt.close();
  }
}

printFinalProjection(projection, confirmedWorkflowProofs);
if (projection.status !== "done") {
  process.exitCode = 1;
}
