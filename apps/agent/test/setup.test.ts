import { describe, expect, it } from "vitest";
import {
  buildHuggingFaceProviderManifest,
  HUGGING_FACE_BASE_URL,
  HUGGING_FACE_MODEL_CONTEXT_LENGTH,
  HUGGING_FACE_MODEL_ID,
  HUGGING_FACE_MODEL_NAME,
  HUGGING_FACE_PROVIDER_NAME,
  HUGGING_FACE_TRUEFORGE_MODEL,
} from "../src/setup.js";

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
