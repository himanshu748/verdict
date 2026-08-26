import { describe, expect, it } from "vitest";
import {
  APPROVAL_REQUIRED_TOOLS,
  buildGitHubConnectorManifest,
  buildVerdictAgentManifest,
  GITHUB_MCP_NAME,
  GITHUB_MCP_TOOLS_HEADER,
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
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "Attempt to delegate each act to one dedicated dynamic subagent, sequentially",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "approval_nonce must match the host-provided policy exactly",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "Request the host-authorized workflow once as a separate Verdict integration proof",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain("ACT 1, HUNTER");
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain("at most 8 condition cells");
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain("ACT 2, SURGEON");
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain("at most 12 relevant commits");
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain("ACT 3, INSURANCE");
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "owner, repo, workflow_id, ref and inputs.approval_nonce must match",
    );
  });

  it("keeps the GitHub token only in connector headers", () => {
    const token = ["github", "pat", "fixture"].join("_");
    const connector = buildGitHubConnectorManifest(token);
    const agent = buildVerdictAgentManifest("openai/gpt-5.2");

    expect(connector.auth).toEqual({
      type: "header",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-MCP-Tools": GITHUB_MCP_TOOLS_HEADER,
      },
    });
    expect(GITHUB_MCP_TOOLS_HEADER).toBe(
      "issue_read,get_file_contents,search_code,list_commits,actions_run_trigger",
    );
    expect(JSON.stringify(agent)).not.toContain(token);
    expect(agent.instructions).not.toContain("GITHUB_TOKEN");
  });

  it.each(["ghp_classic_fixture", "opaque-fixture-token"])(
    "rejects a broad or non-fine-grained GitHub token %s",
    (token) => {
      expect(() => buildGitHubConnectorManifest(token)).toThrow(
        "fine-grained personal access token",
      );
    },
  );
});
