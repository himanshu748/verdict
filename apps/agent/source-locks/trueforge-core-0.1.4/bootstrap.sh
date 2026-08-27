#!/bin/sh
set -eu
umask 077

manifest_id='trueforge-417-v1'
node_version='22.14.0'
node_archive="node-v${node_version}-linux-x64.tar.gz"
node_archive_sha256='9d942932535988091034dc94cc5f42b6dc8784d6366df3a36c4c9ccb3996f0c2'
lock_commit='6de6a98d9b5d4ea08ab60e6a421d9327f6ec0e2f'
lock_base="https://raw.githubusercontent.com/himanshu748/verdict/${lock_commit}/apps/agent/source-locks/trueforge-core-0.1.4"
package_json_sha256='300195bb2197bcf952f68ab386c4ac57e3e18de4a4181de738f4cb88fdbe1df0'
package_lock_sha256='eadaed8bd320b398cf0a7a6ab9b4a913f2141df22f95ebaf9b83f4514bece199'
package_name='@truefoundry/trueforge-core'
package_version='0.1.4'
package_integrity='sha512-IQX4xHtjR931H49Bj5mivsbAmTS+1DyV56kUN59FevwmUqEzxYVhaC4S/fuGIrQUFY4W8ASU+WHzvOuNBCICeA=='
package_sha512_hex='2105f8c47b6347ddf51f8f418f99a2bec6c09934bed43c95e7a914379f457afc2652a133c58561682e12fdfb8622b414158e16f00494f961f3bceb8d04220278'
issue_commit='506bf5c4d1540fa7cb086f1fb697bbe66d1ea5d4'
provenance_commit='fba492fafd853e897793e8f5f6c5cbd1174e3676'
source_path='packages/trueforge-core/src/core/sandbox/provider/DaytonaProvider.ts'
source_blob_sha1='1fba52e1673e560bce4aa897cb88000dfee75652'
source_file_sha256='bb5835e753f6358ce0c3867cc73a482a0621d120f16e78fd08d27fdb6bfb2e94'
attestations_url='https://registry.npmjs.org/-/npm/v1/attestations/@truefoundry%2ftrueforge-core@0.1.4'
attestation_payload_sha256='2a3927baeca0cf3637b6d81be61d1623f7d13a63059eed6d427a1b0103bf4b95'
node_dir='/opt/verdict-node'
source_dir='/tmp/verdict-source'

test "$(uname -m)" = 'x86_64'
if [ -e "${node_dir}" ] || [ -e "${source_dir}" ]; then
  echo 'Verdict bootstrap requires a clean sandbox.' >&2
  exit 1
fi
curl --proto '=https' --tlsv1.2 -fsSLo "/tmp/${node_archive}" "https://nodejs.org/dist/v${node_version}/${node_archive}"
printf '%s  %s\n' "${node_archive_sha256}" "/tmp/${node_archive}" | sha256sum -c -
mkdir -p "${node_dir}" "${source_dir}"
tar -xzf "/tmp/${node_archive}" -C "${node_dir}" --strip-components=1
export PATH="${node_dir}/bin:${PATH}"
: > /tmp/verdict-npm-globalconfig
: > /tmp/verdict-npm-userconfig
export NPM_CONFIG_GLOBALCONFIG='/tmp/verdict-npm-globalconfig'
export NPM_CONFIG_IGNORE_SCRIPTS='true'
export NPM_CONFIG_REGISTRY='https://registry.npmjs.org/'
export NPM_CONFIG_USERCONFIG='/tmp/verdict-npm-userconfig'
test "$(node --version)" = "v${node_version}"

curl --proto '=https' --tlsv1.2 -fsSLo "${source_dir}/package.json" "${lock_base}/package.json"
curl --proto '=https' --tlsv1.2 -fsSLo "${source_dir}/package-lock.json" "${lock_base}/package-lock.json"
printf '%s  %s\n' "${package_json_sha256}" "${source_dir}/package.json" | sha256sum -c -
printf '%s  %s\n' "${package_lock_sha256}" "${source_dir}/package-lock.json" | sha256sum -c -

node - "${source_dir}/package-lock.json" "${package_integrity}" <<'NODE'
const fs = require("node:fs");
const [lockPath, expectedIntegrity] = process.argv.slice(2);
const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
if (lock.lockfileVersion !== 3) throw new Error("Expected npm lockfile v3");
if (lock.packages?.[""]?.dependencies?.["@truefoundry/trueforge-core"] !== "0.1.4") {
  throw new Error("TrueForge Core root dependency is not exact");
}
const core = lock.packages?.["node_modules/@truefoundry/trueforge-core"];
if (core?.version !== "0.1.4" || core.integrity !== expectedIntegrity) {
  throw new Error("TrueForge Core lock entry does not match the trusted artifact");
}
for (const [path, entry] of Object.entries(lock.packages ?? {})) {
  if (!path.startsWith("node_modules/") || entry.link) continue;
  if (typeof entry.version !== "string" || typeof entry.integrity !== "string") {
    throw new Error(`Unlocked dependency entry: ${path}`);
  }
  if (typeof entry.resolved !== "string" || !entry.resolved.startsWith("https://registry.npmjs.org/")) {
    throw new Error(`Untrusted dependency source: ${path}`);
  }
}
NODE

cd "${source_dir}"
npm ci --ignore-scripts --no-audit --no-fund --silent
npm audit signatures

curl --proto '=https' --tlsv1.2 -fsSLo /tmp/verdict-attestations.json "${attestations_url}"

curl --proto '=https' --tlsv1.2 -fsSLo /tmp/verdict-source-issue.ts "https://raw.githubusercontent.com/truefoundry/trueforge/${issue_commit}/${source_path}"
curl --proto '=https' --tlsv1.2 -fsSLo /tmp/verdict-source-provenance.ts "https://raw.githubusercontent.com/truefoundry/trueforge/${provenance_commit}/${source_path}"
printf '%s  %s\n' "${source_file_sha256}" /tmp/verdict-source-issue.ts | sha256sum -c -
printf '%s  %s\n' "${source_file_sha256}" /tmp/verdict-source-provenance.ts | sha256sum -c -
cmp -s /tmp/verdict-source-issue.ts /tmp/verdict-source-provenance.ts

node - /tmp/verdict-attestations.json /tmp/verdict-source-issue.ts "${package_name}" "${package_version}" "${package_sha512_hex}" "${provenance_commit}" "${source_blob_sha1}" "${attestation_payload_sha256}" <<'NODE'
const crypto = require("node:crypto");
const fs = require("node:fs");
const [attestationsPath, sourcePath, packageName, packageVersion, packageDigest, provenanceCommit, sourceBlob, payloadDigest] = process.argv.slice(2);
const response = JSON.parse(fs.readFileSync(attestationsPath, "utf8"));
const envelopes = (response.attestations ?? []).map((attestation) => attestation.bundle?.dsseEnvelope);
const slsa = envelopes.map((envelope) => ({
  envelope,
  payload: Buffer.from(envelope?.payload ?? "", "base64"),
})).filter(({ payload }) => {
  try {
    return JSON.parse(payload.toString("utf8")).predicateType === "https://slsa.dev/provenance/v1";
  } catch {
    return false;
  }
});
if (slsa.length !== 1) throw new Error("Expected exactly one npm SLSA provenance statement");
const [{ envelope, payload }] = slsa;
if (envelope?.payloadType !== "application/vnd.in-toto+json") {
  throw new Error("Unexpected SLSA envelope payload type");
}
if (crypto.createHash("sha256").update(payload).digest("hex") !== payloadDigest) {
  throw new Error("SLSA payload does not match the trusted manifest");
}
const provenance = JSON.parse(payload.toString("utf8"));
const expectedSubject = `pkg:npm/%40truefoundry/trueforge-core@${packageVersion}`;
if (!provenance.subject?.some((subject) => subject.name === expectedSubject && subject.digest?.sha512 === packageDigest)) {
  throw new Error("Provenance subject does not match the trusted package");
}
const build = provenance.predicate?.buildDefinition;
if (
  build?.externalParameters?.workflow?.repository !== "https://github.com/truefoundry/trueforge" ||
  build?.externalParameters?.workflow?.path !== ".github/workflows/release.yml" ||
  build?.externalParameters?.workflow?.ref !== "refs/heads/main"
) {
  throw new Error("Provenance repository does not match TrueForge");
}
if (!build?.resolvedDependencies?.some((dependency) =>
  dependency.uri === "git+https://github.com/truefoundry/trueforge@refs/heads/main" &&
  dependency.digest?.gitCommit === provenanceCommit
)) {
  throw new Error("Provenance commit does not match the trusted manifest");
}
const source = fs.readFileSync(sourcePath);
const gitBlob = crypto.createHash("sha1").update(Buffer.from(`blob ${source.length}\0`)).update(source).digest("hex");
if (gitBlob !== sourceBlob) throw new Error("Source Git blob does not match the trusted manifest");
const core = require(`${packageName}/core`);
if (typeof core.DaytonaSandboxProvider !== "function") {
  throw new Error("Installed package does not expose DaytonaSandboxProvider");
}
console.log(JSON.stringify({
  manifestId: "trueforge-417-v1",
  package: `${packageName}@${packageVersion}`,
  provenanceCommit,
  sourceBlob,
  status: "bootstrap-verified",
}));
NODE
