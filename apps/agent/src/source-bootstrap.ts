import { resolveTrustedSourceManifest } from "./source-manifest.js";

export const VERDICT_SOURCE_DIR = "/tmp/verdict-source";
export const VERDICT_NODE_DIR = "/opt/verdict-node";
export const VERDICT_NODE_BINARY = `${VERDICT_NODE_DIR}/bin/node`;
export const VERDICT_BOOTSTRAP_SCRIPT = "/tmp/verdict-source-bootstrap.sh";
export const VERDICT_REPRODUCTION_DOWNLOAD = "/tmp/verdict-reproduction.mjs";
export const VERDICT_REPRODUCTION_RUNNER =
  `${VERDICT_SOURCE_DIR}/verdict-reproduction.mjs`;

export function buildSourceBootstrapCommand(
  manifestId: string,
): string {
  const manifest = resolveTrustedSourceManifest(manifestId);

  return [
    "set -eu",
    `curl --proto '=https' --tlsv1.2 -fsSLo ${VERDICT_BOOTSTRAP_SCRIPT} '${manifest.bootstrap.url}'`,
    `printf '%s  %s\\n' '${manifest.bootstrap.sha256}' '${VERDICT_BOOTSTRAP_SCRIPT}' | sha256sum -c -`,
    `curl --proto '=https' --tlsv1.2 -fsSLo ${VERDICT_REPRODUCTION_DOWNLOAD} '${manifest.reproductionRunner.url}'`,
    `printf '%s  %s\\n' '${manifest.reproductionRunner.sha256}' '${VERDICT_REPRODUCTION_DOWNLOAD}' | sha256sum -c -`,
    `/bin/sh ${VERDICT_BOOTSTRAP_SCRIPT}`,
    `install -m 0444 ${VERDICT_REPRODUCTION_DOWNLOAD} ${VERDICT_REPRODUCTION_RUNNER}`,
  ].join(" && ");
}
