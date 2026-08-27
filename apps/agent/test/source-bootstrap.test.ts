import { describe, expect, it } from "vitest";
import {
  assertSourcePackageTarget,
  buildSourceBootstrapCommand,
  VERDICT_NODE_BINARY,
  VERDICT_SOURCE_DIR,
} from "../src/source-bootstrap.js";

const sourceTarget = {
  integrity:
    "sha512-IQX4xHtjR931H49Bj5mivsbAmTS+1DyV56kUN59FevwmUqEzxYVhaC4S/fuGIrQUFY4W8ASU+WHzvOuNBCICeA==",
  spec: "@truefoundry/trueforge-core@0.1.4",
};

describe("trusted source package bootstrap", () => {
  it("builds one bounded, credential-free bootstrap command", () => {
    const command = buildSourceBootstrapCommand(sourceTarget);

    expect(command).toContain(
      "https://nodejs.org/dist/v22.14.0/node-v22.14.0-linux-x64.tar.gz",
    );
    expect(command).toContain(
      "9d942932535988091034dc94cc5f42b6dc8784d6366df3a36c4c9ccb3996f0c2",
    );
    expect(command).toContain(sourceTarget.spec);
    expect(command).toContain(sourceTarget.integrity);
    expect(command).toContain(VERDICT_NODE_BINARY);
    expect(command).toContain("export PATH=/opt/verdict-node/bin:$PATH");
    expect(command).toContain(`cd ${VERDICT_SOURCE_DIR}`);
    expect(command).toContain(
      "require('@truefoundry/trueforge-core/core')",
    );
    expect(command).not.toContain("github.com");
    expect(command).not.toContain("GITHUB_TOKEN");
    expect(command).not.toContain("DAYTONA_API_KEY");
    expect(command.length).toBeLessThan(1_800);
  });

  it("normalizes surrounding whitespace on trusted values", () => {
    expect(
      assertSourcePackageTarget({
        integrity: ` ${sourceTarget.integrity} `,
        spec: ` ${sourceTarget.spec} `,
      }),
    ).toEqual(sourceTarget);
  });

  it.each([
    "@truefoundry/trueforge-core@latest",
    "@truefoundry/trueforge-core@0.1",
    "@truefoundry/trueforge-core@0.1.4;curl",
  ])("rejects unsafe or floating package spec %s", (spec) => {
    expect(() =>
      assertSourcePackageTarget({ ...sourceTarget, spec }),
    ).toThrow("exact npm package version");
  });

  it("rejects a malformed package integrity", () => {
    expect(() =>
      assertSourcePackageTarget({
        ...sourceTarget,
        integrity: "sha512-not valid",
      }),
    ).toThrow("sha512 SRI");
  });
});
