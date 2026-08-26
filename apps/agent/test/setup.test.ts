import { describe, expect, it } from "vitest";
import {
  buildDaytonaSandboxProviderManifest,
  buildHuggingFaceProviderManifest,
  DAYTONA_AUTO_ARCHIVE_MINUTES,
  DAYTONA_AUTO_DELETE_MINUTES,
  DAYTONA_AUTO_STOP_MINUTES,
  DAYTONA_EXEC_TIMEOUT_MS,
  HUGGING_FACE_BASE_URL,
  HUGGING_FACE_MODEL_CONTEXT_LENGTH,
  HUGGING_FACE_MODEL_ID,
  HUGGING_FACE_MODEL_NAME,
  HUGGING_FACE_PROVIDER_NAME,
  HUGGING_FACE_TRUEFORGE_MODEL,
} from "../src/setup.js";

describe("Daytona TrueForge sandbox provider", () => {
  it("builds the bounded sandbox provider used by Verdict", () => {
    expect(buildDaytonaSandboxProviderManifest("dtn_test_token")).toEqual({
      auth: { apiKey: "dtn_test_token" },
      autoArchiveIntervalInMinutes: DAYTONA_AUTO_ARCHIVE_MINUTES,
      autoDeleteIntervalInMinutes: DAYTONA_AUTO_DELETE_MINUTES,
      autoStopIntervalInMinutes: DAYTONA_AUTO_STOP_MINUTES,
      execTimeoutMs: DAYTONA_EXEC_TIMEOUT_MS,
      type: "daytona",
    });
  });

  it("rejects a missing Daytona key", () => {
    expect(() => buildDaytonaSandboxProviderManifest("  ")).toThrow(
      "DAYTONA_API_KEY is required",
    );
  });
});

describe("Hugging Face TrueForge provider", () => {
  it("builds the OpenAI-compatible provider used by Verdict", () => {
    const manifest = buildHuggingFaceProviderManifest("hf_test_token");

    expect(manifest).toEqual({
      auth: { apiKey: "hf_test_token" },
      baseUrl: HUGGING_FACE_BASE_URL,
      models: [
        {
          modelId: HUGGING_FACE_MODEL_ID,
          name: HUGGING_FACE_MODEL_NAME,
          properties: {
            contextLength: HUGGING_FACE_MODEL_CONTEXT_LENGTH,
            reasoningEfforts: ["low", "medium", "xhigh"],
          },
        },
      ],
      name: HUGGING_FACE_PROVIDER_NAME,
      type: "custom",
    });
    expect(HUGGING_FACE_TRUEFORGE_MODEL).toBe(
      "huggingface/qwen3.8-27b",
    );
  });

  it("rejects a missing Hugging Face token", () => {
    expect(() => buildHuggingFaceProviderManifest("  ")).toThrow(
      "HF_TOKEN is required",
    );
  });
});
