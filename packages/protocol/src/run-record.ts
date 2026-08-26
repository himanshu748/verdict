import { z } from "zod";

export const runOutcomeSchema = z.enum(["FAIL_MATCH", "PASS", "UNRESOLVED"]);

const runRecordBaseSchema = z.object({
  schemaVersion: z.literal(1),
  caseId: z.string().min(1),
  conditionId: z.string().min(1),
  runId: z.string().min(1),
  phase: z.enum(["matrix", "history", "regression"]),
  commitSha: z.string().min(7),
  command: z.string().min(1),
  environment: z.record(z.string(), z.string()),
  startedAt: z.iso.datetime({ offset: true }),
  durationMs: z.number().int().nonnegative(),
  outputExcerpt: z.string(),
});

const nonZeroExitCodeSchema = z.number().int().refine((exitCode) => exitCode !== 0, {
  message: "exitCode must be non-zero",
});

export const runRecordSchema = z.discriminatedUnion("outcome", [
  runRecordBaseSchema.extend({
    outcome: z.literal("FAIL_MATCH"),
    signatureMatched: z.literal(true),
    exitCode: nonZeroExitCodeSchema,
  }),
  runRecordBaseSchema.extend({
    outcome: z.literal("PASS"),
    signatureMatched: z.literal(false),
    exitCode: z.literal(0),
  }),
  runRecordBaseSchema.extend({
    outcome: z.literal("UNRESOLVED"),
    signatureMatched: z.literal(false),
    exitCode: z.union([z.null(), nonZeroExitCodeSchema]),
  }),
]);

export type RunOutcome = z.infer<typeof runOutcomeSchema>;
export type RunRecord = z.infer<typeof runRecordSchema>;
