import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { TrueForgeApi } from "@truefoundry/trueforge-sdk";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildReproductionRunnerSource,
  buildTrustedReproductionCommand,
  captureRecordedReproduction,
  writeRecordedReproduction,
  type RecordedReproduction,
} from "../src/reproduction-evidence.js";
import type {
  InvestigationTarget,
  VerdictEventProjection,
} from "../src/session.js";

const execFileAsync = promisify(execFile);
const manifestId = "trueforge-417-v1";
const target: InvestigationTarget = {
  issueNumber: 417,
  repository: "truefoundry/trueforge",
  sourceManifestId: manifestId,
};
const temporaryDirectories: string[] = [];

function observation(
  prefix: "healthy" | "stalled",
  index: number,
  settlement: "pending" | "resolved",
) {
  return {
    durationMs: settlement === "pending" ? 1_000 : 12,
    outputExcerpt:
      settlement === "pending"
        ? "POST /snapshots observed; provider call remained pending for 1000 ms"
        : "POST /snapshots observed; provider resolved with state active",
    requestSeen: true,
    responseState: settlement === "resolved" ? "active" : null,
    runId: `${prefix}-${String(index).padStart(2, "0")}`,
    settlement,
    startedAt: `2026-08-29T00:00:${String(index).padStart(2, "0")}.000Z`,
  };
}

function runnerEnvelope(stalledCount = 10, healthyCount = 10) {
  return {
    kind: "verdict.reproduction-observations",
    schemaVersion: 1,
    sourceManifestId: manifestId,
    package: "@truefoundry/trueforge-core@0.1.4",
    issueCommit: "506bf5c4d1540fa7cb086f1fb697bbe66d1ea5d4",
    provider: {
      className: "DaytonaSandboxProvider",
      module: "@truefoundry/trueforge-core/core",
    },
    environment: {
      arch: "x64",
      node: "v22.14.0",
      platform: "linux",
      providerTimeoutMs: "100",
    },
    observationBoundaryMs: 1_000,
    conditions: [
      {
        conditionId: "daytona-stalled-endpoint",
        observations: Array.from({ length: stalledCount }, (_, index) =>
          observation("stalled", index + 1, "pending"),
        ),
      },
      {
        conditionId: "daytona-responsive-endpoint",
        observations: Array.from({ length: healthyCount }, (_, index) =>
          observation("healthy", index + 1, "resolved"),
        ),
      },
    ],
  };
}

function projectionFor(command: string): VerdictEventProjection {
  return {
    assistantText: "",
    error: null,
    modelToolCalls: [
      {
        argumentsJson: JSON.stringify({
          intent: "Run the host-pinned provider reproduction",
          command,
        }),
        functionName: "exec",
        index: 0,
        sourceEventId: "event-model",
        threadId: "thread-hunter",
        toolCallId: "call-reproduction",
        toolInfo: { type: "truefoundry-system", name: "exec" },
      },
    ],
    pendingApprovals: [],
    sessionId: "session-live",
    status: "running",
    threads: [
      {
        name: "Hunter",
        status: "running",
        threadId: "thread-hunter",
        title: "Hunter",
      },
    ],
    turnId: "turn-live",
  };
}

function toolResponseEvent(
  envelope: ReturnType<typeof runnerEnvelope>,
): TrueForgeApi.ToolResponseEvent {
  return {
    content: JSON.stringify({
      success: true,
      response: {
        exitCode: 0,
        result: `${JSON.stringify(envelope)}\n`,
      },
    }),
    createdAt: "2026-08-29T00:01:00.000Z",
    id: "event-tool-response",
    threadId: "thread-hunter",
    toolCallId: "call-reproduction",
    type: "tool.response",
  };
}

function captureValidEvidence(): RecordedReproduction {
  const command = buildTrustedReproductionCommand(manifestId);
  const captured = captureRecordedReproduction(
    projectionFor(command),
    toolResponseEvent(runnerEnvelope()),
    target,
  );
  if (!captured) {
    throw new Error("Expected the trusted tool response to be captured.");
  }
  return captured;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { force: true, recursive: true }),
    ),
  );
});

describe("published provider reproduction runner", () => {
  it("observes the real provider stall and its responsive contrast", async () => {
    const directory = await mkdtemp(
      join(dirname(fileURLToPath(import.meta.url)), ".runner-"),
    );
    temporaryDirectories.push(directory);
    const runnerPath = join(directory, "reproduce.mjs");
    await writeFile(
      runnerPath,
      buildReproductionRunnerSource({
        observationBoundaryMs: 50,
        repetitionsPerCondition: 1,
      }),
    );

    const { stdout } = await execFileAsync(process.execPath, [runnerPath], {
      timeout: 5_000,
    });
    const result = JSON.parse(stdout.trim()) as ReturnType<
      typeof runnerEnvelope
    >;

    expect(result.provider).toEqual({
      className: "DaytonaSandboxProvider",
      module: "@truefoundry/trueforge-core/core",
    });
    expect(result.conditions[0]?.observations).toMatchObject([
      { requestSeen: true, settlement: "pending" },
    ]);
    expect(result.conditions[1]?.observations).toMatchObject([
      { requestSeen: true, settlement: "resolved" },
    ]);
  });
});

describe("recorded reproduction capture", () => {
  it("pins ten real provider stalls only when ten responsive contrasts pass", () => {
    const evidence = captureValidEvidence();

    expect(evidence).toMatchObject({
      kind: "verdict.recorded-reproduction",
      schemaVersion: 1,
      sessionId: "session-live",
      turnId: "turn-live",
      hunterThreadId: "thread-hunter",
      toolCallId: "call-reproduction",
      verdict: "REPRODUCED",
      conditions: [
        {
          conditionId: "daytona-stalled-endpoint",
          classification: {
            matched: 10,
            observed: 10,
            state: "REPRODUCTION_PINNED",
          },
        },
        {
          conditionId: "daytona-responsive-endpoint",
          classification: {
            matched: 0,
            observed: 10,
            state: "NOT_REPRODUCED",
          },
        },
      ],
    });
    expect(evidence.conditions[0]?.records).toHaveLength(10);
    expect(evidence.conditions[0]?.records[0]).toMatchObject({
      command: buildTrustedReproductionCommand(manifestId),
      exitCode: 124,
      outcome: "FAIL_MATCH",
      signatureMatched: true,
    });
    expect(evidence.conditions[1]?.records).toHaveLength(10);
    expect(evidence.conditions[1]?.records[0]).toMatchObject({
      exitCode: 0,
      outcome: "PASS",
      signatureMatched: false,
    });
  });

  it("ignores every model-authored command outside the host pin", () => {
    const event = toolResponseEvent(runnerEnvelope());

    expect(
      captureRecordedReproduction(
        projectionFor("node model-authored-fetch-imitation.mjs"),
        event,
        target,
      ),
    ).toBeNull();
  });

  it("rejects an undersampled or unobserved provider condition", () => {
    const command = buildTrustedReproductionCommand(manifestId);
    const projection = projectionFor(command);

    expect(() =>
      captureRecordedReproduction(
        projection,
        toolResponseEvent(runnerEnvelope(9, 10)),
        target,
      ),
    ).toThrow("exactly 10 observations");

    const missingRequest = runnerEnvelope();
    missingRequest.conditions[0]!.observations[0]!.requestSeen = false;
    expect(() =>
      captureRecordedReproduction(
        projection,
        toolResponseEvent(missingRequest),
        target,
      ),
    ).toThrow("must observe POST /snapshots");
  });
});

describe("immutable evidence persistence", () => {
  it("is idempotent for identical evidence and refuses an overwrite", async () => {
    const evidence = captureValidEvidence();
    const directory = await mkdtemp(join(tmpdir(), "verdict-evidence-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "reproduction.json");

    const first = await writeRecordedReproduction(path, evidence);
    const second = await writeRecordedReproduction(path, evidence);
    const original = await readFile(path, "utf8");

    expect(second).toEqual(first);
    expect(first.digestSha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      writeRecordedReproduction(path, {
        ...evidence,
        toolResponseEventId: "different-event",
      }),
    ).rejects.toThrow("Refusing to overwrite recorded reproduction evidence");
    expect(await readFile(path, "utf8")).toBe(original);
  });
});
