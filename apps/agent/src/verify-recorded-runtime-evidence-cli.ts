import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  parseRecordedRuntimeEvidence,
  RECORDED_RUNTIME_EVIDENCE_PATH,
} from "./recorded-runtime-evidence.js";

const requestedPath = process.argv[2];
if (!requestedPath) {
  throw new Error("Recorded runtime evidence path is required.");
}

const content = await readFile(resolve(requestedPath), "utf8");
const binding = parseRecordedRuntimeEvidence(content);
if (binding.path !== RECORDED_RUNTIME_EVIDENCE_PATH) {
  throw new Error("Recorded runtime evidence path is not trusted.");
}
process.stdout.write(`${JSON.stringify(binding)}\n`);
