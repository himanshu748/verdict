import { describe, expect, it } from "vitest";
import {
  assertLoopbackTrueForgeUrl,
  createTrueForgeClient,
} from "../src/client.js";

describe("TrueForge client boundary", () => {
  it.each([
    "http://localhost:8790",
    "http://127.0.0.1:8790",
    "http://[::1]:8790",
  ])("accepts loopback URL %s", (url) => {
    expect(assertLoopbackTrueForgeUrl(url)).toBeInstanceOf(URL);
  });

  it.each([
    "https://localhost:8790",
    "http://trueforge.internal:8790",
    "http://user:password@127.0.0.1:8790",
  ])("rejects non-local or credential-bearing URL %s", (url) => {
    expect(() => assertLoopbackTrueForgeUrl(url)).toThrow();
  });

  it("keeps a live three-act SSE turn open for up to one hour", () => {
    const client = createTrueForgeClient();
    const options = Reflect.get(client, "_options") as {
      timeoutInSeconds?: number;
    };

    expect(options.timeoutInSeconds).toBe(3600);
  });
});
