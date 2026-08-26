import type { TrueForge, TrueForgeApi } from "@truefoundry/trueforge-sdk";
import {
  buildGitHubConnectorManifest,
  buildVerdictAgentManifest,
  VERDICT_AGENT_NAME,
} from "./policy.js";

export interface VerdictRuntimeConfig {
  githubToken: string;
  modelName: string;
}

export interface VerdictRuntimeResources {
  agent: TrueForgeApi.Agent;
  connector: TrueForgeApi.ConfiguredMcpServer;
}

export async function upsertGitHubConnector(
  client: TrueForge,
  githubToken: string,
): Promise<TrueForgeApi.ConfiguredMcpServer> {
  const response = await client.settings.mcpServers.createOrUpdate({
    manifest: buildGitHubConnectorManifest(githubToken),
  });

  return response.data;
}

export async function upsertVerdictAgent(
  client: TrueForge,
  modelName: string,
): Promise<TrueForgeApi.Agent> {
  const manifest = buildVerdictAgentManifest(modelName);
  const agents = await client.agents.list();
  const existing = agents.data.find((agent) => agent.name === VERDICT_AGENT_NAME);

  if (existing) {
    const response = await client.agents.update(existing.id, { manifest });
    return response.data;
  }

  const response = await client.agents.create({
    name: VERDICT_AGENT_NAME,
    manifest,
  });
  return response.data;
}

export async function ensureVerdictRuntime(
  client: TrueForge,
  config: VerdictRuntimeConfig,
): Promise<VerdictRuntimeResources> {
  // Configure the secret-bearing connector independently so the token never
  // enters the agent manifest, instructions, session input or event stream.
  const connector = await upsertGitHubConnector(client, config.githubToken);
  const agent = await upsertVerdictAgent(client, config.modelName);

  return { agent, connector };
}
