import { createTrueForgeClientFromEnv } from "./client.js";
import { ensureVerdictRuntime } from "./setup.js";

const githubToken = process.env.GITHUB_TOKEN?.trim();
const modelName = process.env.TRUEFORGE_MODEL?.trim();

if (!githubToken) {
  throw new Error("GITHUB_TOKEN is required.");
}

if (!modelName) {
  throw new Error("TRUEFORGE_MODEL is required.");
}

const resources = await ensureVerdictRuntime(createTrueForgeClientFromEnv(), {
  githubToken,
  modelName,
});

// Never print manifests here. The connector manifest contains the secret header.
console.log(
  JSON.stringify(
    {
      agent: { id: resources.agent.id, name: resources.agent.name },
      connector: { name: resources.connector.manifest.name },
    },
    null,
    2,
  ),
);
