import { describe, expect, it } from "vitest";
import { sanitizeTerminalField } from "../src/terminal.js";

describe("terminal log sanitisation", () => {
  it("removes C0 and C1 control codes from untrusted labels", () => {
    const value = sanitizeTerminalField(
      "\u001b]8;;https://example.invalid\u0007Hunter\nforged\rline\u009b31m",
    );

    expect(value).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/u);
    expect(value).toBe("]8;;https://example.invalid Hunter forged line 31m");
  });

  it("bounds untrusted labels to one hundred sixty code points", () => {
    const value = sanitizeTerminalField("🧪".repeat(200));

    expect(Array.from(value)).toHaveLength(160);
    expect(value.endsWith("…")).toBe(true);
  });
});
