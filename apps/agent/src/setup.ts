import type { TrueForge, TrueForgeApi } from "@truefoundry/trueforge-sdk";
import {
  buildGitHubConnectorManifest,
  buildVerdictAgentManifest,
  VERDICT_AGENT_NAME,
} from "./policy.js";

export const HUGGING_FACE_PROVIDER_NAME = "huggingface";
export const HUGGING_FACE_BASE_URL = "https://router.huggingface.co/v1";
export const HUGGING_FACE_MODEL_NAME = "qwen3.8-27b";
export const HUGGING_FACE_MODEL_ID = "Qwen/Qwen3.8-27B:deepinfra";
export const HUGGING_FACE_MODEL_CONTEXT_LENGTH = 262_144;
export const HUGGING_FACE_TRUEFORGE_MODEL =
  `${HUGGING_FACE_PROVIDER_NAME}/${HUGGING_FACE_MODEL_NAME}`;

export interface VerdictRuntimeConfig {
  githubToken: string;
  huggingFaceToken: string;
  modelName: string;
}

export interface VerdictRuntimeResources {
  agent: TrueForgeApi.Agent;
  connector: TrueForgeApi.ConfiguredMcpServer;
  provider: TrueForgeApi.ConfiguredModelProvider;
}

export function buildHuggingFaceProviderManifest(
  token: string,
): TrueForgeApi.CustomModelProvider {
  const apiKey = token.trim();
  if (!apiKey) {
    throw new Error("HF_TOKEN is required to configure Hugging Face inference.");
  }

  return {
    auth: { apiKey },
    baseUrl: HUGGING_FACE_BASE_URL,
    models: [
      {
        modelId: HUGGING_FACE_MODEL_ID,
        name: HUGGING_FACE_MODEL_NAME,
        properties: {
          contextLength: HUGGING_FACE_MODEL_CONTEXT_LENGTH,
          reasoningEfforts: ["low", "medium", "xhigh"],
        },
      },
    ],
    name: HUGGING_FACE_PROVIDER_NAME,
    type: "custom",
  };
}

export async function upsertHuggingFaceProvider(
  client: TrueForge,
  token: string,
): Promise<TrueForgeApi.ConfiguredModelProvider> {
  const response = await client.settings.modelProviders.createOrUpdate({
    manifest: buildHuggingFaceProviderManifest(token),
  });

  return response.data;
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
  // Configure secret-bearing resources independently so neither token enters
  // the agent manifest, instructions, session input or event stream.
  const provider = await upsertHuggingFaceProvider(
    client,
    config.huggingFaceToken,
  );
  const connector = await upsertGitHubConnector(client, config.githubToken);
  const agent = await upsertVerdictAgent(client, config.modelName);

  return { agent, connector, provider };
}
