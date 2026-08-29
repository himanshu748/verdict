import record from "../../../evidence/trueforge-417/reproduction.json";

export type RecordedRun = {
  runId: string;
  outcome: string;
  command: string;
  commitSha: string;
  exitCode: number | null;
  durationMs: number;
  startedAt: string;
  outputExcerpt: string;
  signatureMatched: boolean;
};

export type RecordedCondition = {
  conditionId: string;
  state: string;
  matched: number;
  observed: number;
  runs: RecordedRun[];
};

function toRuns(records: readonly Record<string, unknown>[]): RecordedRun[] {
  return records.map((item) => ({
    runId: String(item.runId),
    outcome: String(item.outcome),
    command: String(item.command),
    commitSha: String(item.commitSha),
    exitCode: item.exitCode === null ? null : Number(item.exitCode),
    durationMs: Number(item.durationMs),
    startedAt: String(item.startedAt),
    outputExcerpt: String(item.outputExcerpt),
    signatureMatched: Boolean(item.signatureMatched),
  }));
}

export const recordedCase = {
  verdict: record.verdict,
  capturedAt: record.capturedAt,
  source: record.source,
  integrity: record.integrity,
  sessionId: record.sessionId,
  hunterThreadId: record.hunterThreadId,
  conditions: record.conditions.map((condition) => ({
    conditionId: condition.conditionId,
    state: condition.classification.state,
    matched: condition.classification.matched,
    observed: condition.classification.observed,
    runs: toRuns(condition.records as unknown as Record<string, unknown>[]),
  })) satisfies RecordedCondition[],
};

export type RecordedCase = typeof recordedCase;
