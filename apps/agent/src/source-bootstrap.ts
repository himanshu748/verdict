export const VERDICT_SOURCE_DIR = "/tmp/verdict-source";
export const VERDICT_NODE_DIR = "/opt/verdict-node";
export const VERDICT_NODE_BINARY = `${VERDICT_NODE_DIR}/bin/node`;

const NODE_VERSION = "22.14.0";
const NODE_ARCHIVE = `node-v${NODE_VERSION}-linux-x64.tar.gz`;
const NODE_ARCHIVE_URL = `https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ARCHIVE}`;
const NODE_ARCHIVE_SHA256 =
  "9d942932535988091034dc94cc5f42b6dc8784d6366df3a36c4c9ccb3996f0c2";
const SOURCE_PACKAGE_PATTERN =
  /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*@[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;
const SOURCE_INTEGRITY_PATTERN = /^sha512-[A-Za-z0-9+/]+={0,2}$/;

export interface SourcePackageTarget {
  integrity: string;
  spec: string;
}

export function assertSourcePackageTarget(
  target: SourcePackageTarget,
): SourcePackageTarget {
  const spec = target.spec.trim();
  const integrity = target.integrity.trim();

  if (!SOURCE_PACKAGE_PATTERN.test(spec)) {
    throw new Error(
      "VERDICT_SOURCE_PACKAGE must be an exact npm package version.",
    );
  }
  if (!SOURCE_INTEGRITY_PATTERN.test(integrity)) {
    throw new Error(
      "VERDICT_SOURCE_PACKAGE_INTEGRITY must be a sha512 SRI value.",
    );
  }

  return { integrity, spec };
}

function packageNameFromSpec(spec: string): string {
  return spec.slice(0, spec.lastIndexOf("@"));
}

export function buildSourceBootstrapCommand(
  sourceTarget: SourcePackageTarget,
): string {
  const target = assertSourcePackageTarget(sourceTarget);
  const packageName = packageNameFromSpec(target.spec);

  return [
    "set -eu",
    'test "$(uname -m)" = "x86_64"',
    `curl -fsSLo /tmp/${NODE_ARCHIVE} ${NODE_ARCHIVE_URL}`,
    `printf '%s  %s\\n' '${NODE_ARCHIVE_SHA256}' '/tmp/${NODE_ARCHIVE}' | sha256sum -c -`,
    `mkdir -p ${VERDICT_NODE_DIR} ${VERDICT_SOURCE_DIR}`,
    `tar -xzf /tmp/${NODE_ARCHIVE} -C ${VERDICT_NODE_DIR} --strip-components=1`,
    `export PATH=${VERDICT_NODE_DIR}/bin:$PATH`,
    `test "$(${VERDICT_NODE_BINARY} --version)" = "v${NODE_VERSION}"`,
    `cd ${VERDICT_SOURCE_DIR}`,
    `${VERDICT_NODE_DIR}/bin/npm init -y --silent >/dev/null`,
    `package_tarball=$(${VERDICT_NODE_DIR}/bin/npm pack --silent ${target.spec} --pack-destination /tmp)`,
    `${VERDICT_NODE_BINARY} -e "const c=require('node:crypto'),f=require('node:fs');if('sha512-'+c.createHash('sha512').update(f.readFileSync(process.argv[1])).digest('base64')!==process.argv[2])process.exit(1)" "/tmp/$package_tarball" '${target.integrity}'`,
    `${VERDICT_NODE_DIR}/bin/npm install --ignore-scripts --no-audit --no-fund --silent "/tmp/$package_tarball"`,
    `${VERDICT_NODE_BINARY} -e "const core=require('${packageName}/core');if(typeof core.DaytonaSandboxProvider!=='function')process.exit(1)"`,
  ].join(" && ");
}
