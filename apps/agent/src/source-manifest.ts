export interface TrustedSourceManifest {
  readonly artifact: Readonly<{
    attestationPayloadSha256: string;
    attestationUrl: string;
    integrity: string;
    packageSha512Hex: string;
    provenanceCommit: string;
    spec: string;
  }>;
  readonly bootstrap: Readonly<{
    sha256: string;
    url: string;
  }>;
  readonly id: string;
  readonly issueCommit: string;
  readonly issueNumber: number;
  readonly lock: Readonly<{
    commit: string;
    packageCount: number;
    packageJsonSha256: string;
    packageJsonUrl: string;
    packageLockSha256: string;
    packageLockUrl: string;
  }>;
  readonly repository: string;
  readonly source: Readonly<{
    blobSha1: string;
    fileSha256: string;
    path: string;
  }>;
}

const TRUEFORGE_417_MANIFEST: TrustedSourceManifest = Object.freeze({
  artifact: Object.freeze({
    attestationPayloadSha256:
      "2a3927baeca0cf3637b6d81be61d1623f7d13a63059eed6d427a1b0103bf4b95",
    attestationUrl:
      "https://registry.npmjs.org/-/npm/v1/attestations/@truefoundry%2ftrueforge-core@0.1.4",
    integrity:
      "sha512-IQX4xHtjR931H49Bj5mivsbAmTS+1DyV56kUN59FevwmUqEzxYVhaC4S/fuGIrQUFY4W8ASU+WHzvOuNBCICeA==",
    packageSha512Hex:
      "2105f8c47b6347ddf51f8f418f99a2bec6c09934bed43c95e7a914379f457afc2652a133c58561682e12fdfb8622b414158e16f00494f961f3bceb8d04220278",
    provenanceCommit: "fba492fafd853e897793e8f5f6c5cbd1174e3676",
    spec: "@truefoundry/trueforge-core@0.1.4",
  }),
  bootstrap: Object.freeze({
    sha256:
      "a3f59a85438a6cf72b590e51a8c1730ef2562d8974d022a18edde93f5d2e7b23",
    url: "https://raw.githubusercontent.com/himanshu748/verdict/6cdf7f1b26200dfd3300af613492b09d0f3e84a9/apps/agent/source-locks/trueforge-core-0.1.4/bootstrap.sh",
  }),
  id: "trueforge-417-v1",
  issueCommit: "506bf5c4d1540fa7cb086f1fb697bbe66d1ea5d4",
  issueNumber: 417,
  lock: Object.freeze({
    commit: "6de6a98d9b5d4ea08ab60e6a421d9327f6ec0e2f",
    packageCount: 315,
    packageJsonSha256:
      "300195bb2197bcf952f68ab386c4ac57e3e18de4a4181de738f4cb88fdbe1df0",
    packageJsonUrl:
      "https://raw.githubusercontent.com/himanshu748/verdict/6de6a98d9b5d4ea08ab60e6a421d9327f6ec0e2f/apps/agent/source-locks/trueforge-core-0.1.4/package.json",
    packageLockSha256:
      "eadaed8bd320b398cf0a7a6ab9b4a913f2141df22f95ebaf9b83f4514bece199",
    packageLockUrl:
      "https://raw.githubusercontent.com/himanshu748/verdict/6de6a98d9b5d4ea08ab60e6a421d9327f6ec0e2f/apps/agent/source-locks/trueforge-core-0.1.4/package-lock.json",
  }),
  repository: "truefoundry/trueforge",
  source: Object.freeze({
    blobSha1: "1fba52e1673e560bce4aa897cb88000dfee75652",
    fileSha256:
      "bb5835e753f6358ce0c3867cc73a482a0621d120f16e78fd08d27fdb6bfb2e94",
    path:
      "packages/trueforge-core/src/core/sandbox/provider/DaytonaProvider.ts",
  }),
});

const TRUSTED_SOURCE_MANIFESTS: Readonly<
  Record<string, TrustedSourceManifest>
> = Object.freeze({
  [TRUEFORGE_417_MANIFEST.id]: TRUEFORGE_417_MANIFEST,
});

export function resolveTrustedSourceManifest(
  manifestId: string,
): TrustedSourceManifest {
  const normalizedId = manifestId.trim();
  const manifest = TRUSTED_SOURCE_MANIFESTS[normalizedId];

  if (!manifest) {
    throw new Error(
      `Unknown VERDICT_SOURCE_MANIFEST_ID: ${normalizedId || "(empty)"}.`,
    );
  }

  return manifest;
}
