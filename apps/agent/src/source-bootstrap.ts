import { resolveTrustedSourceManifest } from "./source-manifest.js";

export const VERDICT_SOURCE_DIR = "/tmp/verdict-source";
export const VERDICT_NODE_DIR = "/opt/verdict-node";
export const VERDICT_NODE_BINARY = `${VERDICT_NODE_DIR}/bin/node`;
export const VERDICT_BOOTSTRAP_SCRIPT = "/tmp/verdict-source-bootstrap.sh";

export function buildSourceBootstrapCommand(
  manifestId: string,
): string {
  const manifest = resolveTrustedSourceManifest(manifestId);

  return [
    "set -eu",
    `curl --proto '=https' --tlsv1.2 -fsSLo ${VERDICT_BOOTSTRAP_SCRIPT} '${manifest.bootstrap.url}'`,
    `printf '%s  %s\\n' '${manifest.bootstrap.sha256}' '${VERDICT_BOOTSTRAP_SCRIPT}' | sha256sum -c -`,
    `/bin/sh ${VERDICT_BOOTSTRAP_SCRIPT}`,
  ].join(" && ");
}
