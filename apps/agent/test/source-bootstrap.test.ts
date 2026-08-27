import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildSourceBootstrapCommand,
  VERDICT_BOOTSTRAP_SCRIPT,
} from "../src/source-bootstrap.js";
import { resolveTrustedSourceManifest } from "../src/source-manifest.js";

const manifestId = "trueforge-417-v1";
const manifest = resolveTrustedSourceManifest(manifestId);
const lockRoot = new URL(
  "../source-locks/trueforge-core-0.1.4/",
  import.meta.url,
);

function sha256(contents: Buffer | string): string {
  return createHash("sha256").update(contents).digest("hex");
}

describe("trusted source manifest", () => {
  it("binds the issue, package provenance and common source blob", () => {
    expect(manifest).toMatchObject({
      id: manifestId,
      issueCommit: "506bf5c4d1540fa7cb086f1fb697bbe66d1ea5d4",
      issueNumber: 417,
      repository: "truefoundry/trueforge",
      artifact: {
        provenanceCommit: "fba492fafd853e897793e8f5f6c5cbd1174e3676",
        spec: "@truefoundry/trueforge-core@0.1.4",
      },
      source: {
        blobSha1: "1fba52e1673e560bce4aa897cb88000dfee75652",
        path:
          "packages/trueforge-core/src/core/sandbox/provider/DaytonaProvider.ts",
      },
    });
  });

  it("normalizes a known ID and rejects every unknown ID", () => {
    expect(resolveTrustedSourceManifest(` ${manifestId} `)).toBe(manifest);
    expect(() => resolveTrustedSourceManifest("trueforge-418-v1")).toThrow(
      "Unknown VERDICT_SOURCE_MANIFEST_ID",
    );
    expect(() => resolveTrustedSourceManifest(" ")).toThrow(
      "Unknown VERDICT_SOURCE_MANIFEST_ID",
    );
  });
});

describe("trusted source bootstrap", () => {
  it("builds one compact checksum-pinned command", () => {
    const command = buildSourceBootstrapCommand(manifestId);

    expect(command).toContain(manifest.bootstrap.url);
    expect(command).toContain(manifest.bootstrap.sha256);
    expect(command).toContain(VERDICT_BOOTSTRAP_SCRIPT);
    expect(command).toContain("sha256sum -c -");
    expect(command).toContain(`/bin/sh ${VERDICT_BOOTSTRAP_SCRIPT}`);
    expect(command).not.toContain("npm install");
    expect(command).not.toContain("npm pack");
    expect(command).not.toContain("GITHUB_TOKEN");
    expect(command).not.toContain("DAYTONA_API_KEY");
    expect(command.length).toBeLessThan(1_000);
  });

  it("pins the audited script and every provenance anchor", () => {
    const script = readFileSync(new URL("bootstrap.sh", lockRoot), "utf8");

    expect(sha256(script)).toBe(manifest.bootstrap.sha256);
    expect(script).toContain(`lock_commit='${manifest.lock.commit}'`);
    expect(script).toContain(
      'lock_base="https://raw.githubusercontent.com/himanshu748/verdict/${lock_commit}/apps/agent/source-locks/trueforge-core-0.1.4"',
    );
    expect(manifest.lock.packageJsonUrl).toBe(
      `https://raw.githubusercontent.com/himanshu748/verdict/${manifest.lock.commit}/apps/agent/source-locks/trueforge-core-0.1.4/package.json`,
    );
    expect(script).toContain(manifest.lock.packageJsonSha256);
    expect(manifest.lock.packageLockUrl).toBe(
      `https://raw.githubusercontent.com/himanshu748/verdict/${manifest.lock.commit}/apps/agent/source-locks/trueforge-core-0.1.4/package-lock.json`,
    );
    expect(script).toContain(manifest.lock.packageLockSha256);
    expect(script).toContain(manifest.artifact.attestationUrl);
    expect(script).toContain(manifest.artifact.attestationPayloadSha256);
    expect(script).toContain(manifest.artifact.packageSha512Hex);
    expect(script).toContain(manifest.artifact.provenanceCommit);
    expect(script).toContain(manifest.issueCommit);
    expect(script).toContain(manifest.source.path);
    expect(script).toContain(manifest.source.fileSha256);
    expect(script).toContain(manifest.source.blobSha1);
    expect(script).toContain("npm ci --ignore-scripts");
    expect(script).toContain("npm audit signatures");
    expect(script).toContain("NPM_CONFIG_REGISTRY='https://registry.npmjs.org/'");
    expect(script).toContain(
      "NPM_CONFIG_GLOBALCONFIG='/tmp/verdict-npm-globalconfig'",
    );
    expect(script).toContain(
      "NPM_CONFIG_USERCONFIG='/tmp/verdict-npm-userconfig'",
    );
    expect(script).toContain("Verdict bootstrap requires a clean sandbox.");
    expect(script).not.toContain("npm install");
    expect(script).not.toContain("npm pack");
    expect(script).not.toContain("GITHUB_TOKEN");
    expect(script).not.toContain("DAYTONA_API_KEY");
  });

  it("pins the complete npm closure with registry integrity", () => {
    const packageJson = readFileSync(new URL("package.json", lockRoot));
    const packageLock = readFileSync(new URL("package-lock.json", lockRoot));
    const lock = JSON.parse(packageLock.toString("utf8")) as {
      lockfileVersion: number;
      packages: Record<
        string,
        {
          dependencies?: Record<string, string>;
          integrity?: string;
          link?: boolean;
          resolved?: string;
          version?: string;
        }
      >;
    };

    expect(sha256(packageJson)).toBe(manifest.lock.packageJsonSha256);
    expect(sha256(packageLock)).toBe(manifest.lock.packageLockSha256);
    expect(lock.lockfileVersion).toBe(3);
    expect(lock.packages[""]?.dependencies?.["@truefoundry/trueforge-core"])
      .toBe("0.1.4");

    const packages = Object.entries(lock.packages).filter(
      ([path, entry]) => path.startsWith("node_modules/") && !entry.link,
    );
    expect(packages).toHaveLength(manifest.lock.packageCount);
    for (const [path, entry] of packages) {
      expect(entry.version, path).toMatch(/^\d+\.\d+\.\d+/);
      expect(entry.integrity, path).toMatch(/^sha512-/);
      expect(entry.resolved, path).toMatch(
        /^https:\/\/registry\.npmjs\.org\//,
      );
    }

    expect(
      lock.packages["node_modules/@truefoundry/trueforge-core"]?.integrity,
    ).toBe(manifest.artifact.integrity);
  });
});
