import { describe, expect, it } from "vitest";
import {
  allowAllPending,
  buildApprovalBatch,
  denyAllPending,
  type PendingApproval,
} from "../src/session.js";

const pending: PendingApproval[] = [
  {
    sourceEventId: "event-1",
    threadId: "thread-hunter",
    toolCallId: "call-1",
  },
  {
    sourceEventId: "event-2",
    threadId: "thread-insurance",
    toolCallId: "call-2",
  },
];

describe("approval batching", () => {
  it("emits one ordered allow event for every pending call", () => {
    expect(allowAllPending(pending)).toEqual([
      {
        type: "user.tool_approval",
        threadId: "thread-hunter",
        toolCallId: "call-1",
        approval: { status: "allow" },
      },
      {
        type: "user.tool_approval",
        threadId: "thread-insurance",
        toolCallId: "call-2",
        approval: { status: "allow" },
      },
    ]);
  });

  it("emits denials together with a normalized reason", () => {
    expect(denyAllPending(pending, "  Not authorized for this run.  ")).toEqual([
      {
        type: "user.tool_approval",
        threadId: "thread-hunter",
        toolCallId: "call-1",
        approval: { status: "deny", reason: "Not authorized for this run." },
      },
      {
        type: "user.tool_approval",
        threadId: "thread-insurance",
        toolCallId: "call-2",
        approval: { status: "deny", reason: "Not authorized for this run." },
      },
    ]);
  });

  it("rejects partial batches", () => {
    expect(() =>
      buildApprovalBatch(pending, [
        {
          decision: "allow",
          threadId: "thread-hunter",
          toolCallId: "call-1",
        },
      ]),
    ).toThrow("Every pending tool call must receive one decision");
  });

  it("rejects decisions for calls that are not pending", () => {
    expect(() =>
      buildApprovalBatch(pending, [
        {
          decision: "allow",
          threadId: "thread-hunter",
          toolCallId: "call-1",
        },
        {
          decision: "deny",
          reason: "Unknown call",
          threadId: "thread-other",
          toolCallId: "call-other",
        },
      ]),
    ).toThrow("does not match a pending tool call");
  });
});
