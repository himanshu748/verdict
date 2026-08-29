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
    expect(manifest.model.params).toEqual({
      enable_thinking: false,
      maxTokens: 32_768,
      parallelToolCalls: false,
      reasoningEffort: "low",
      temperature: 0,
    });
    expect(manifest.config?.sandbox).toEqual({
      enabled: true,
      fileDownloads: false,
    });
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "Attempt to delegate each act to one dedicated dynamic subagent, sequentially",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "Call create_sub_agent by itself, never alongside another tool call",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "no more than 2,400 characters",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "Do not paste the full instructions or prior packet",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "Retry create_sub_agent at most once",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "the root must not call GitHub, sandbox, file or discovery tools",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "Each act's returned packet must be at most 900 characters",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "only a download confirmation, SHA or resource pointer",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "Do not search the sandbox for that file",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "Before calling any GitHub, sandbox, file or discovery tool, your first action must be create_sub_agent for Hunter",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "Hunter may make at most 8 total tool calls, including discovery, GitHub and sandbox calls",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "the trusted host-pinned source manifest are the complete research boundary",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "Hunter may execute the trusted source bootstrap command from the host message exactly once and unchanged",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "installs a checksum-verified Node runtime, the complete immutable npm lock closure and the checksum-pinned reproduction runner",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "audits npm signatures, verifies the SLSA package provenance",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "issue commit, artifact provenance commit and shared vulnerable-file blob",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "Do not clone repositories, inspect dependency repositories or acquire anything outside that exact command",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "Hunter may use at most two sandbox commands",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "execute the host-provided trusted reproduction command exactly once and unchanged",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "exactly 10 stalled repetitions and exactly 10 responsive repetitions",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).not.toContain(
      "at most 3 repetitions per cell",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "Before source-level execution, run the trusted source bootstrap unchanged",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "approval_nonce must match the host-provided policy exactly",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "Request the host-authorized workflow once as a separate Verdict integration proof",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "Requesting approval means invoking the actual actions_run_trigger tool",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "Do not return a prose-only workflow proposal",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "the root's next action must be the same exact actions_run_trigger invocation",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain("ACT 1, HUNTER");
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "Use only the runner's two named condition cells",
    );
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain("ACT 2, SURGEON");
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain("at most 12 relevant commits");
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain("ACT 3, INSURANCE");
    expect(VERDICT_AGENT_INSTRUCTIONS).toContain(
      "owner, repo, workflow_id, ref and inputs.approval_nonce must match",
    );
    expect(manifest.mcpServers?.[0]?.preload).toBe(false);
    expect(manifest.mcpServers?.[0]?.preloadTools).toEqual([]);
    expect(manifest.config?.iterationLimit).toBe(64);
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
