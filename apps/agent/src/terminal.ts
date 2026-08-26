const DEFAULT_TERMINAL_FIELD_LIMIT = 160;
const TERMINAL_CONTROL_CODES = /[\u0000-\u001f\u007f-\u009f]/gu;

export function sanitizeTerminalField(
  value: string,
  maxCodePoints = DEFAULT_TERMINAL_FIELD_LIMIT,
): string {
  if (!Number.isSafeInteger(maxCodePoints) || maxCodePoints < 1) {
    throw new Error("maxCodePoints must be a positive integer.");
  }

  const singleLine = value
    .replace(TERMINAL_CONTROL_CODES, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const codePoints = Array.from(singleLine);
  if (codePoints.length <= maxCodePoints) {
    return singleLine;
  }

  return `${codePoints.slice(0, maxCodePoints - 1).join("")}…`;
}
