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

export type HistoryInvariantCode =
  | "INVALID_HISTORY_OBSERVATION"
  | "DUPLICATE_CHRONOLOGICAL_INDEX"
  | "DUPLICATE_COMMIT_SHA";

interface HistoryInvariantErrorOptions {
  code: HistoryInvariantCode;
  message: string;
  observationIndex: number;
  chronologicalIndex?: number;
  commitSha?: string;
  cause?: unknown;
}

export class HistoryInvariantError extends Error {
  readonly code: HistoryInvariantCode;
  readonly observationIndex: number;
  readonly chronologicalIndex: number | undefined;
  readonly commitSha: string | undefined;

  constructor({
    code,
    message,
    observationIndex,
    chronologicalIndex,
    commitSha,
    cause,
  }: HistoryInvariantErrorOptions) {
    super(message, { cause });
    this.name = "HistoryInvariantError";
    this.code = code;
    this.observationIndex = observationIndex;
    this.chronologicalIndex = chronologicalIndex;
    this.commitSha = commitSha;
  }
}

function parseObservations(observations: readonly HistoryObservation[]): HistoryObservation[] {
  return observations.map((observation, observationIndex) => {
    const parsed = historyObservationSchema.safeParse(observation);
    if (!parsed.success) {
      const candidate =
        typeof observation === "object" && observation !== null
          ? (observation as { chronologicalIndex?: unknown; commitSha?: unknown })
          : {};
      const chronologicalIndex =
        typeof candidate.chronologicalIndex === "number"
          ? candidate.chronologicalIndex
          : undefined;
      const commitSha = typeof candidate.commitSha === "string" ? candidate.commitSha : undefined;

      throw new HistoryInvariantError({
        code: "INVALID_HISTORY_OBSERVATION",
        message: `History observation at input index ${observationIndex} is invalid`,
        observationIndex,
        ...(chronologicalIndex === undefined ? {} : { chronologicalIndex }),
        ...(commitSha === undefined ? {} : { commitSha }),
        cause: parsed.error,
      });
    }

    return parsed.data;
  });
}

function assertUniqueObservations(observations: readonly HistoryObservation[]): void {
  const chronologicalIndices = new Set<number>();
  const commitShas = new Set<string>();

  observations.forEach((observation, observationIndex) => {
    if (chronologicalIndices.has(observation.chronologicalIndex)) {
      throw new HistoryInvariantError({
        code: "DUPLICATE_CHRONOLOGICAL_INDEX",
        message: `Chronological index ${observation.chronologicalIndex} occurs more than once`,
        observationIndex,
        chronologicalIndex: observation.chronologicalIndex,
        commitSha: observation.commitSha,
      });
    }

    if (commitShas.has(observation.commitSha)) {
      throw new HistoryInvariantError({
        code: "DUPLICATE_COMMIT_SHA",
        message: `Commit SHA ${observation.commitSha} occurs more than once`,
        observationIndex,
        chronologicalIndex: observation.chronologicalIndex,
        commitSha: observation.commitSha,
      });
    }

    chronologicalIndices.add(observation.chronologicalIndex);
    commitShas.add(observation.commitSha);
  });
}

export function classifyBoundary(observations: readonly HistoryObservation[]): BoundaryResult {
  const validatedObservations = parseObservations(observations);
  assertUniqueObservations(validatedObservations);

  const ordered = validatedObservations.sort(
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
