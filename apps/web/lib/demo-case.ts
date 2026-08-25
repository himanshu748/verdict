import {
  classifyBoundary,
  classifyReproduction,
  type HistoryObservation,
  type ReproductionResult,
  type RunOutcome,
  type RunRecord,
} from "@verdict/protocol";

export type DemoCondition = {
  id: string;
  endpoint: string;
  upstream: string;
  budgetMs: number;
  records: RunRecord[];
  result: ReproductionResult;
};

export type DemoHistoryEntry = HistoryObservation & {
  title: string;
  date: string;
  url: string;
};

const caseId = "trueforge-417";
const reportCommit = "506bf5c4d1540fa7cb086f1fb697bbe66d1ea5d4";
const command = "pnpm vitest run test/daytona-timeout.test.ts --pool=threads";
const recordSchemaVersion = 1 as const;
const matrixPhase = "matrix" as const;

type ConditionSpec = {
  id: string;
  endpoint: string;
  upstream: string;
  matches: number;
  unresolved?: number;
};

const conditionSpecs: ConditionSpec[] = [
  { id: "01", endpoint: "capabilities", upstream: "120 ms", matches: 0 },
  { id: "02", endpoint: "capabilities", upstream: "500 ms", matches: 2 },
  { id: "03", endpoint: "capabilities", upstream: "750 ms", matches: 7 },
  { id: "04", endpoint: "capabilities", upstream: "no response", matches: 10 },
  { id: "05", endpoint: "settings", upstream: "120 ms", matches: 0 },
  { id: "06", endpoint: "settings", upstream: "500 ms", matches: 1 },
  { id: "07", endpoint: "settings", upstream: "750 ms", matches: 6 },
  { id: "08", endpoint: "settings", upstream: "no response", matches: 10 },
  { id: "09", endpoint: "turn creation", upstream: "120 ms", matches: 0 },
  { id: "10", endpoint: "turn creation", upstream: "500 ms", matches: 3 },
  { id: "11", endpoint: "turn creation", upstream: "750 ms", matches: 8 },
  { id: "12", endpoint: "turn creation", upstream: "no response", matches: 9, unresolved: 1 },
];

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
  const upstreamDelay = spec.upstream === "no response" ? "stalled" : spec.upstream;
  const baseRecord = {
    schemaVersion: recordSchemaVersion,
    caseId,
    conditionId: `condition-${spec.id}`,
    runId: `${caseId}-c${spec.id}-r${String(index + 1).padStart(2, "0")}`,
    phase: matrixPhase,
    commitSha: reportCommit,
    command,
    environment: {
      ENDPOINT: spec.endpoint,
      HARNESS_BUDGET_MS: "750",
      NODE_VERSION: "22.14.0",
      OS: "linux",
      UPSTREAM_DELAY: upstreamDelay,
    },
    startedAt: new Date(Date.UTC(2026, 7, 25, 6, Number(spec.id), index)).toISOString(),
    durationMs: isMatch ? 752 + index : isPass ? 116 + index * 7 : 0,
    outputExcerpt: isMatch
      ? "REQUEST_BUDGET_EXCEEDED: POST /snapshots remained pending after 750ms"
      : isPass
        ? "Daytona snapshot registration settled inside the 750ms observation budget"
        : "Fixture worker exited before a valid observation was recorded",
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
    endpoint: spec.endpoint,
    upstream: spec.upstream,
    budgetMs: 750,
    records,
    result: classifyReproduction(records, 10),
  };
}

const history: DemoHistoryEntry[] = [
  {
    chronologicalIndex: 0,
    commitSha: "f29d9abb317c34326c2db782fc45c1edfe9bf039",
    outcome: "PASS",
    title: "Rename package folders to align with package name",
    date: "2026-08-16",
    url: "https://github.com/truefoundry/trueforge/commit/f29d9abb317c34326c2db782fc45c1edfe9bf039",
  },
  {
    chronologicalIndex: 5,
    commitSha: "69237db843c2951d30335b1763e31b869be7fe88",
    outcome: "FAIL_MATCH",
    title: "Enhance DaytonaSandboxProvider with build failure handling",
    date: "2026-08-17",
    url: "https://github.com/truefoundry/trueforge/commit/69237db843c2951d30335b1763e31b869be7fe88",
  },
  {
    chronologicalIndex: 6,
    commitSha: "9441da05d83154ca7750a3824c13741786eb9707",
    outcome: "FAIL_MATCH",
    title: "Enable eslint curly rule as error",
    date: "2026-08-17",
    url: "https://github.com/truefoundry/trueforge/commit/9441da05d83154ca7750a3824c13741786eb9707",
  },
  {
    chronologicalIndex: 7,
    commitSha: "42eee39597d4a696c3ab04d282a96ca6416be103",
    outcome: "FAIL_MATCH",
    title: "Implement local sandbox",
    date: "2026-08-19",
    url: "https://github.com/truefoundry/trueforge/commit/42eee39597d4a696c3ab04d282a96ca6416be103",
  },
  {
    chronologicalIndex: 8,
    commitSha: reportCommit,
    outcome: "FAIL_MATCH",
    title: "Issue report baseline",
    date: "2026-08-24",
    url: "https://github.com/truefoundry/trueforge/commit/506bf5c4d1540fa7cb086f1fb697bbe66d1ea5d4",
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

export const demoCase = {
  fixtureVersion: 1,
  generatedAt: "2026-08-25T08:30:00.000Z",
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
    command,
    threshold: 10,
    matrixSize: conditions.length,
    observationBudgetMs: 750,
    permissionMode: "Read-only until publication approval",
  },
  conditions,
  selectedConditionId: selectedCondition.id,
  selectedResult: selectedCondition.result,
  history,
  boundary: classifyBoundary(history),
  regression: {
    test: "fails within 750ms when Daytona accepts a connection but never responds",
    good: { commitSha: history[0]!.commitSha, outcome: "PASS", durationMs: 184 },
    bad: { commitSha: history[1]!.commitSha, outcome: "FAIL_MATCH", durationMs: 752 },
    candidate: { outcome: "NOT_RUN", reason: "No patch is published before approval" },
  },
  publication: {
    targetRepository: "truefoundry/trueforge",
    headRepository: "Resolved by the approved workflow",
    branch: "verdict/issue-417-daytona-timeout",
    workflow: "verdict-publish-draft.yml",
    files: [
      "packages/trueforge-core/src/core/sandbox/provider/DaytonaProvider.ts",
      "test/daytona-timeout.test.ts",
      "VERDICT.md",
      "verdict.json",
    ],
    defaultDecision: "deny",
  },
} as const;

export type DemoCase = typeof demoCase;

export function renderDemoReport(): string {
  return `# Verdict: truefoundry/trueforge#417

Status: ${demoCase.selectedResult.state}

## Reproduction

- Condition: ${selectedCondition.endpoint}, upstream ${selectedCondition.upstream}
- Observed: ${demoCase.selectedResult.matched}/${demoCase.selectedResult.observed} valid runs
- Signature: ${demoCase.contract.signature}
- Command: \`${demoCase.contract.command}\`

## History

- Last demonstrated good: ${demoCase.boundary.goodCommit}
- First demonstrated bad: ${demoCase.boundary.badCommit}
- Boundary: ${demoCase.boundary.state}

## Publication

No public write has occurred. The default approval decision is deny.
`;
}
