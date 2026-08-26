import {
  classifyReproduction,
  type ReproductionResult,
  type RunOutcome,
  type RunRecord,
} from "@verdict/protocol";

export type DemoCondition = {
  id: string;
  requestBudgetMs: number;
  upstream: string;
  upstreamBehavior: string;
  records: RunRecord[];
  result: ReproductionResult;
};

export type DemoHistoryEntry = {
  chronologicalIndex: number;
  commitSha: string;
  outcome: "UNRESOLVED";
  title: string;
  date: string;
  url: string;
  relationship: "IMMEDIATE_PARENT" | "STATIC_DIFF_SUSPECT";
  basis: string;
};

const caseId = "trueforge-417";
const reportCommit = "506bf5c4d1540fa7cb086f1fb697bbe66d1ea5d4";
const immediateParentCommit = "f7a0a181a87e025c925f2cbe604e164db99323d5";
const staticDiffSuspectCommit = "69237db843c2951d30335b1763e31b869be7fe88";
const proposedTestPath =
  "packages/trueforge-core/tests/core/sandbox/daytonaSnapshotRegistration.test.ts";
const proposedTestCommand =
  "pnpm --filter @truefoundry/trueforge-core test -- tests/core/sandbox/daytonaSnapshotRegistration.test.ts --runInBand";
const recordSchemaVersion = 1 as const;
const matrixPhase = "matrix" as const;

type ConditionSpec = {
  id: string;
  requestBudgetMs: number;
  upstream: string;
  upstreamBehavior: string;
  matches: number;
  unresolved?: number;
};

const conditionSpecs: ConditionSpec[] = [
  { id: "01", requestBudgetMs: 750, upstream: "120 ms delay", upstreamBehavior: "DELAY_120_MS", matches: 0 },
  { id: "02", requestBudgetMs: 750, upstream: "500 ms delay", upstreamBehavior: "DELAY_500_MS", matches: 0 },
  { id: "03", requestBudgetMs: 750, upstream: "750 ms delay", upstreamBehavior: "DELAY_750_MS", matches: 6 },
  { id: "04", requestBudgetMs: 750, upstream: "no response", upstreamBehavior: "NO_RESPONSE", matches: 10 },
  { id: "05", requestBudgetMs: 500, upstream: "120 ms delay", upstreamBehavior: "DELAY_120_MS", matches: 0 },
  { id: "06", requestBudgetMs: 500, upstream: "500 ms delay", upstreamBehavior: "DELAY_500_MS", matches: 6 },
  { id: "07", requestBudgetMs: 500, upstream: "750 ms delay", upstreamBehavior: "DELAY_750_MS", matches: 10 },
  { id: "08", requestBudgetMs: 500, upstream: "no response", upstreamBehavior: "NO_RESPONSE", matches: 10 },
  { id: "09", requestBudgetMs: 250, upstream: "120 ms delay", upstreamBehavior: "DELAY_120_MS", matches: 0 },
  { id: "10", requestBudgetMs: 250, upstream: "500 ms delay", upstreamBehavior: "DELAY_500_MS", matches: 10 },
  { id: "11", requestBudgetMs: 250, upstream: "750 ms delay", upstreamBehavior: "DELAY_750_MS", matches: 10 },
  { id: "12", requestBudgetMs: 250, upstream: "no response", upstreamBehavior: "NO_RESPONSE", matches: 9, unresolved: 1 },
];

function commandFor(spec: ConditionSpec): string {
  return [
    "VERDICT_SCENARIO=SNAPSHOT_REGISTRATION",
    `VERDICT_REQUEST_BUDGET_MS=${spec.requestBudgetMs}`,
    `VERDICT_UPSTREAM_BEHAVIOR=${spec.upstreamBehavior}`,
    proposedTestCommand,
  ].join(" ");
}

function outcomesFor(spec: ConditionSpec): RunOutcome[] {
  const unresolved = spec.unresolved ?? 0;
  const passes = 10 - spec.matches - unresolved;
  return [
    ...Array<RunOutcome>(spec.matches).fill("FAIL_MATCH"),
    ...Array<RunOutcome>(passes).fill("PASS"),
    ...Array<RunOutcome>(unresolved).fill("UNRESOLVED"),
  ];
}

function recordFor(spec: ConditionSpec, outcome: RunOutcome, index: number): RunRecord {
  const isMatch = outcome === "FAIL_MATCH";
  const isPass = outcome === "PASS";
  const upstreamDelayMs = Number(spec.upstreamBehavior.match(/\d+/)?.[0] ?? 0);
  const baseRecord = {
    schemaVersion: recordSchemaVersion,
    caseId,
    conditionId: `condition-${spec.id}`,
    runId: `${caseId}-c${spec.id}-r${String(index + 1).padStart(2, "0")}`,
    phase: matrixPhase,
    commitSha: reportCommit,
    command: commandFor(spec),
    environment: {
      EVIDENCE_MODE: "CONCEPTUAL_SIMULATION",
      EXECUTION_STATUS: "NOT_RUN",
      FIXTURE_STATUS: "PROPOSED_NOT_IMPLEMENTED",
      NODE_VERSION: "22.14.0",
      OS: "linux",
      VERDICT_REQUEST_BUDGET_MS: String(spec.requestBudgetMs),
      VERDICT_SCENARIO: "SNAPSHOT_REGISTRATION",
      VERDICT_UPSTREAM_BEHAVIOR: spec.upstreamBehavior,
    },
    startedAt: new Date(Date.UTC(2026, 7, 25, 6, Number(spec.id), index)).toISOString(),
    durationMs: isMatch
      ? spec.requestBudgetMs + 2 + index
      : isPass
        ? Math.max(1, Math.min(spec.requestBudgetMs - 1, upstreamDelayMs + index))
        : 0,
    outputExcerpt: isMatch
      ? `SIMULATED FIXTURE: REQUEST_BUDGET_EXCEEDED after the conceptual ${spec.requestBudgetMs}ms budget with ${spec.upstream}`
      : isPass
        ? `SIMULATED FIXTURE: snapshot registration settled inside the conceptual ${spec.requestBudgetMs}ms budget with ${spec.upstream}`
        : "SIMULATED FIXTURE: no valid conceptual observation was generated",
  };

  if (outcome === "FAIL_MATCH") {
    return { ...baseRecord, exitCode: 1, outcome, signatureMatched: true };
  }
  if (outcome === "PASS") {
    return { ...baseRecord, exitCode: 0, outcome, signatureMatched: false };
  }
  return { ...baseRecord, exitCode: null, outcome, signatureMatched: false };
}

function buildCondition(spec: ConditionSpec): DemoCondition {
  const records = outcomesFor(spec).map((outcome, index) => recordFor(spec, outcome, index));
  return {
    id: spec.id,
    requestBudgetMs: spec.requestBudgetMs,
    upstream: spec.upstream,
    upstreamBehavior: spec.upstreamBehavior,
    records,
    result: classifyReproduction(records, 10),
  };
}

const history: DemoHistoryEntry[] = [
  {
    chronologicalIndex: 0,
    commitSha: immediateParentCommit,
    outcome: "UNRESOLVED",
    title: "Add BUGBOT.md files",
    date: "2026-08-17",
    url: `https://github.com/truefoundry/trueforge/commit/${immediateParentCommit}`,
    relationship: "IMMEDIATE_PARENT",
    basis: "Immediate parent of the suspect commit. No runtime observation was made.",
  },
  {
    chronologicalIndex: 1,
    commitSha: staticDiffSuspectCommit,
    outcome: "UNRESOLVED",
    title: "AGE-1831: enhance DaytonaSandboxProvider with build failure handling (#258)",
    date: "2026-08-17",
    url: `https://github.com/truefoundry/trueforge/commit/${staticDiffSuspectCommit}`,
    relationship: "STATIC_DIFF_SUSPECT",
    basis:
      "Static diff inspection shows this commit introduced the raw awaited snapshot registration fetch. No runtime observation was made.",
  },
];

const conditions = conditionSpecs.map(buildCondition);
function requireCondition(conditionId: string): DemoCondition {
  const condition = conditions.find((item) => item.id === conditionId);
  if (condition === undefined) {
    throw new Error(`The simulated demo fixture must include condition ${conditionId}`);
  }
  return condition;
}

const selectedCondition = requireCondition("04");
const selectedRecord = selectedCondition.records[0];
if (selectedRecord === undefined) {
  throw new Error(`The simulated demo fixture must include records for condition ${selectedCondition.id}`);
}
const selectedCommand = selectedRecord.command;

export const demoCase = {
  fixtureVersion: 1,
  generatedAt: "2026-08-25T08:30:00.000Z",
  evidenceMode: "CONCEPTUAL_SIMULATION",
  executionStatus: "NOT_RUN",
  disclaimer:
    "All matrix records, durations and outcomes are generated examples for the Verdict interface. They are not captured Daytona or Jest executions. The parameterized Jest fixture is proposed and not implemented.",
  id: caseId,
  source: {
    repository: "truefoundry/trueforge",
    issueNumber: 417,
    title: "Daytona snapshot registration has no request timeout",
    issueUrl: "https://github.com/truefoundry/trueforge/issues/417",
    reportCommit,
  },
  contract: {
    signature: "REQUEST_BUDGET_EXCEEDED while POST /snapshots remains pending",
    command: selectedCommand,
    commandStatus: "NOT_RUN",
    commandPurpose: "Proposed parameterized Jest fixture",
    fixtureStatus: "PROPOSED_NOT_IMPLEMENTED",
    proposedTestPath,
    threshold: 10,
    matrixSize: conditions.length,
    requestBudgetMs: selectedCondition.requestBudgetMs,
    permissionMode: "Read-only until publication approval",
  },
  conditions,
  selectedConditionId: selectedCondition.id,
  selectedResult: selectedCondition.result,
  history,
  suspectRange: {
    state: "STATIC_DIFF_SUSPECT_RANGE",
    immediateParentCommit,
    suspectCommit: staticDiffSuspectCommit,
    runtimePolarity: "NOT_ESTABLISHED",
    basis:
      "The suspect commit adds the raw awaited fetch. Its immediate parent anchors the lower end of this static-diff range. Neither commit was executed by Verdict.",
  },
  testPlan: {
    status: "NOT_RUN",
    fixtureStatus: "PROPOSED_NOT_IMPLEMENTED",
    path: proposedTestPath,
    command: selectedCommand,
    scenario:
      "Extend the existing test file with a controlled fetch that reads the proposed budget and upstream behavior variables, then assert an explicit request budget aborts a stalled registration.",
    expectedBeforeFix:
      "The proposed test should expose that registerSnapshot has no explicit timeout.",
    expectedAfterFix:
      "The proposed test should settle with the documented timeout error inside the configured budget.",
  },
  publication: {
    status: "NOT_CONFIGURED",
    targetRepository: "truefoundry/trueforge",
    headRepository: "Not configured",
    branch: "verdict/issue-417-daytona-timeout",
    branchStatus: "PROPOSED",
    workflow: "verdict-publish-draft.yml",
    workflowStatus: "PROPOSED_NOT_PRESENT",
    files: [
      "packages/trueforge-core/src/core/sandbox/provider/DaytonaProvider.ts",
      proposedTestPath,
      "VERDICT.md",
      "verdict.json",
    ],
    defaultDecision: "deny",
  },
} as const;

export type DemoCase = typeof demoCase;

export function renderDemoReport(): string {
  return `# Verdict demo: truefoundry/trueforge#417

Evidence mode: conceptual simulation
Execution status: not run

This artifact contains generated example records for the Verdict interface. It is not evidence from a Daytona or Jest execution. The parameterized fixture is proposed and not implemented.

## Simulated reproduction model

- Condition: ${selectedCondition.requestBudgetMs} ms request budget, upstream ${selectedCondition.upstream}
- Generated result: ${demoCase.selectedResult.state}
- Generated records: ${demoCase.selectedResult.matched}/${demoCase.selectedResult.observed} matched the conceptual signature
- Conceptual signature: ${demoCase.contract.signature}

## Static-diff suspect range

- Immediate parent: ${demoCase.suspectRange.immediateParentCommit}
- Static-diff suspect: ${demoCase.suspectRange.suspectCommit}
- Basis: ${demoCase.suspectRange.basis}
- Runtime polarity: not established

## Proposed Jest test plan

- Status: not run
- Fixture status: proposed, not implemented
- Existing test file to extend: \`${demoCase.testPlan.path}\`
- Proposed command: \`${demoCase.testPlan.command}\`
- Scenario: ${demoCase.testPlan.scenario}

## Publication

No publication workflow is configured. No public write has occurred. The default approval decision is deny.
`;
}
