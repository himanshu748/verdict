import { demoCase } from "./demo-case";

export type ExposureState =
  | "not-reproduced"
  | "weak-signal"
  | "partial"
  | "pinned"
  | "running"
  | "unresolved";

export type Exposure = {
  id: string;
  command: string;
  environment: string;
  matched: number;
  total: number;
  state: ExposureState;
  texturePosition: string;
};

const stateByVerdict = {
  REPRODUCTION_PINNED: "pinned",
  PARTIAL_REPRODUCTION: "partial",
  WEAK_SIGNAL: "weak-signal",
  NOT_REPRODUCED: "not-reproduced",
  UNRESOLVED: "unresolved",
} as const satisfies Record<string, ExposureState>;

export const sampleExposures: Exposure[] = demoCase.conditions.map((condition, index) => {
  const firstRecord = condition.records[0];
  if (firstRecord === undefined) {
    throw new Error(`The sample exposure must include records for condition ${condition.id}`);
  }

  return {
    id: condition.id,
    command: firstRecord.command,
    environment: `${condition.requestBudgetMs} ms budget / ${condition.upstream}`,
    matched: condition.result.matched,
    total: condition.result.observed,
    state: stateByVerdict[condition.result.state],
    texturePosition: `${(index % 4) * 33.33}% ${Math.floor(index / 4) * 50}%`,
  };
});

export const exposureStateLabel: Record<ExposureState, string> = {
  "not-reproduced": "Not reproduced",
  "weak-signal": "Weak signal",
  partial: "Partial",
  pinned: "Pinned",
  running: "Running",
  unresolved: "Unresolved",
};
