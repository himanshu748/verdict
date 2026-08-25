import { z } from "zod";
import { runOutcomeSchema } from "./run-record.js";

export const historyObservationSchema = z.object({
  commitSha: z.string().min(7),
  chronologicalIndex: z.number().int().nonnegative(),
  outcome: runOutcomeSchema,
});

export const boundaryStateSchema = z.enum([
  "EXACT_BOUNDARY",
  "BOUNDARY_RANGE",
  "NON_MONOTONIC",
  "UNRESOLVED",
]);

export const boundaryResultSchema = z.object({
  state: boundaryStateSchema,
  goodCommit: z.string().nullable(),
  badCommit: z.string().nullable(),
});

export type HistoryObservation = z.infer<typeof historyObservationSchema>;
export type BoundaryResult = z.infer<typeof boundaryResultSchema>;

export function classifyBoundary(observations: readonly HistoryObservation[]): BoundaryResult {
  const ordered = [...observations].sort(
    (left, right) => left.chronologicalIndex - right.chronologicalIndex,
  );
  const valid = ordered.filter((observation) => observation.outcome !== "UNRESOLVED");

  if (valid.length < 2) {
    return { state: "UNRESOLVED", goodCommit: null, badCommit: null };
  }

  const transitions = valid.slice(1).flatMap((observation, index) => {
    const previous = valid[index]!;
    return previous.outcome === observation.outcome ? [] : [{ previous, observation }];
  });

  if (transitions.length !== 1) {
    const hasPass = valid.some((observation) => observation.outcome === "PASS");
    const hasFailure = valid.some((observation) => observation.outcome === "FAIL_MATCH");
    return {
      state: hasPass && hasFailure ? "NON_MONOTONIC" : "UNRESOLVED",
      goodCommit: null,
      badCommit: null,
    };
  }

  const transition = transitions[0]!;
  if (transition.previous.outcome !== "PASS" || transition.observation.outcome !== "FAIL_MATCH") {
    return { state: "NON_MONOTONIC", goodCommit: null, badCommit: null };
  }

  const adjacent =
    transition.observation.chronologicalIndex - transition.previous.chronologicalIndex === 1;

  return {
    state: adjacent ? "EXACT_BOUNDARY" : "BOUNDARY_RANGE",
    goodCommit: transition.previous.commitSha,
    badCommit: transition.observation.commitSha,
  };
}
