import { createTrueForgeClientFromEnv } from "./client.js";
import {
  ensureVerdictRuntime,
  HUGGING_FACE_TRUEFORGE_MODEL,
} from "./setup.js";

const githubToken = process.env.GITHUB_TOKEN?.trim();
const huggingFaceToken = process.env.HF_TOKEN?.trim();
const daytonaApiKey = process.env.DAYTONA_API_KEY?.trim();
const modelName =
  process.env.TRUEFORGE_MODEL?.trim() || HUGGING_FACE_TRUEFORGE_MODEL;

if (!githubToken) {
  throw new Error("GITHUB_TOKEN is required.");
}

if (!huggingFaceToken) {
  throw new Error("HF_TOKEN is required.");
}

if (!daytonaApiKey) {
  throw new Error("DAYTONA_API_KEY is required.");
}

const resources = await ensureVerdictRuntime(createTrueForgeClientFromEnv(), {
  daytonaApiKey,
  githubToken,
  huggingFaceToken,
  modelName,
});

// Never print manifests here. The connector manifest contains the secret header.
console.log(
  JSON.stringify(
    {
      agent: { id: resources.agent.id, name: resources.agent.name },
      connector: { name: resources.connector.manifest.name },
      provider: { name: resources.provider.name, model: modelName },
      sandbox: {
        status: resources.sandboxProvider.status,
        type: resources.sandboxProvider.manifest.type,
      },
    },
    null,
    2,
  ),
);
