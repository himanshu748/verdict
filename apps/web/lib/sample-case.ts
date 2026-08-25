export type ExposureState =
  | "not-reproduced"
  | "weak-signal"
  | "partial"
  | "pinned"
  | "running"
  | "unresolved";

export type Exposure = {
  id: string;
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

export const sampleExposures: Exposure[] = demoCase.conditions.map((condition, index) => ({
  id: condition.id,
  environment: `${condition.endpoint} / ${condition.upstream}`,
  matched: condition.result.matched,
  total: condition.result.observed,
  state: stateByVerdict[condition.result.state],
  texturePosition: `${(index % 4) * 33.33}% ${Math.floor(index / 4) * 50}%`,
}));

export const exposureStateLabel: Record<ExposureState, string> = {
  "not-reproduced": "Not reproduced",
  "weak-signal": "Weak signal",
  partial: "Partial",
  pinned: "Pinned",
  running: "Running",
  unresolved: "Unresolved",
};
import { demoCase } from "@/lib/demo-case";
