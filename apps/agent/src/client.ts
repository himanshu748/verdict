import { TrueForge } from "@truefoundry/trueforge-sdk";

const DEFAULT_BASE_URL = "http://127.0.0.1:8790";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

export interface TrueForgeClientConfig {
  baseUrl?: string;
  timeoutInSeconds?: number;
  token?: string;
}

export function assertLoopbackTrueForgeUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);

  if (url.protocol !== "http:") {
    throw new Error("TRUEFORGE_BASE_URL must use http on a loopback host.");
  }

  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error("TRUEFORGE_BASE_URL must resolve to localhost or a loopback IP.");
  }

  if (url.username || url.password) {
    throw new Error("TRUEFORGE_BASE_URL must not contain credentials.");
  }

  return url;
}

export function createTrueForgeClient(
  config: TrueForgeClientConfig = {},
): TrueForge {
  const baseUrl = assertLoopbackTrueForgeUrl(
    config.baseUrl ?? DEFAULT_BASE_URL,
  ).toString();

  return new TrueForge({
    baseUrl,
    timeoutInSeconds: config.timeoutInSeconds ?? 600,
    ...(config.token ? { token: config.token } : {}),
  });
}

export function createTrueForgeClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TrueForge {
  return createTrueForgeClient({
    ...(env.TRUEFORGE_BASE_URL
      ? { baseUrl: env.TRUEFORGE_BASE_URL }
      : {}),
    ...(env.TRUEFORGE_TOKEN ? { token: env.TRUEFORGE_TOKEN } : {}),
  });
}
