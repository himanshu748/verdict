import { describe, expect, it } from "vitest";
import {
  APPROVAL_REQUIRED_TOOLS,
  buildGitHubConnectorManifest,
  buildVerdictAgentManifest,
  GITHUB_MCP_NAME,
  GITHUB_TOOL_WHITELIST,
  VERDICT_AGENT_INSTRUCTIONS,
} from "../src/policy.js";

describe("Verdict TrueForge manifest policy", () => {
  it("exposes exactly five GitHub tools and gates the only write tool", () => {
    const manifest = buildVerdictAgentManifest("openai/gpt-5.2");
    const github = manifest.mcpServers?.[0];

    expect(github?.name).toBe(GITHUB_MCP_NAME);
    expect(github?.enableTools).toEqual([...GITHUB_TOOL_WHITELIST]);
    expect(github?.enableTools).toHaveLength(5);
    expect(github?.requireApprovalForTools).toEqual([
      ...APPROVAL_REQUIRED_TOOLS,
    ]);
    expect(github?.requireApprovalForTools).toEqual(["actions_run_trigger"]);
  });

  it("enables dynamic subagents and carries bounded instructions for all acts", () => {
    const manifest = buildVerdictAgentManifest("openai/gpt-5.2");

    expect(manifest.config?.dynamicSubAgents?.enabled).toBe(true);
    expect(manifest.config?.sandbox).toEqual({
      enabled: true,
      fileDownloads: false,
    });
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain("ACT 1, HUNTER");
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain("at most 8 condition cells");
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain("ACT 2, SURGEON");
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain("at most 12 relevant commits");
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain("ACT 3, INSURANCE");
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "owner, repo, workflow_id and ref must match",
    );
  });

  it("keeps the GitHub token only in connector headers", () => {
    const token = "test-token-never-log";
    const connector = buildGitHubConnectorManifest(token);
    const agent = buildVerdictAgentManifest("openai/gpt-5.2");

    expect(connector.auth).toEqual({
      type: "header",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(JSON.stringify(agent)).not.toContain(token);
    expect(agent.instructions).not.toContain("GITHUB_TOKEN");
  });
});
