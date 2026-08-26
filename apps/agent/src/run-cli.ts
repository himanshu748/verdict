import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { TrueForgeApi } from "@truefoundry/trueforge-sdk";
import { createTrueForgeClientFromEnv } from "./client.js";
import {
  executeApprovedWorkflowWithProof,
  type ConfirmedWorkflowProof,
} from "./github-proof.js";
import {
  approveVerdictWorkflow,
  buildVerdictRunConfig,
  denyVerdictApprovals,
  parseVerdictDecision,
  startVerdictInvestigation,
  type VerdictEventProjection,
} from "./session.js";
import { sanitizeTerminalField } from "./terminal.js";

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
  confirmedWorkflowProof: ConfirmedWorkflowProof | null,
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
        confirmedWorkflowProof,
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

let projection = await startVerdictInvestigation(
  client,
  config.investigationTarget,
  config.workflowTarget,
  onProjection,
);
let confirmedWorkflowProof: ConfirmedWorkflowProof | null = null;

if (projection.status === "approval_required") {
  const pending = projection.pendingApprovals[0];
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

  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await prompt.question(
      "Type APPROVE VERDICT WORKFLOW to allow the exact dispatch, or DENY: ",
    );
    const decision = parseVerdictDecision(answer);
    if (decision === "approve") {
      const confirmed = await executeApprovedWorkflowWithProof(
        process.env.GITHUB_TOKEN ?? "",
        config.workflowTarget,
        sourceIssueUrl,
        () =>
          approveVerdictWorkflow(
            client,
            projection,
            config.workflowTarget,
            onProjection,
          ),
      );
      projection = confirmed.approvalResult;
      confirmedWorkflowProof = confirmed.proof;
    } else {
      projection = await denyVerdictApprovals(
        client,
        projection,
        "Maintainer denied the proposed public write.",
        onProjection,
      );
    }
  } finally {
    prompt.close();
  }
}

printFinalProjection(projection, confirmedWorkflowProof);
if (projection.status !== "done") {
  process.exitCode = 1;
}
