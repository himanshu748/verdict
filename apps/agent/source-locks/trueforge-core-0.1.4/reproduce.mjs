import { createServer } from "node:http";
import process from "node:process";
import { DaytonaSandboxProvider } from "@truefoundry/trueforge-core/core";

const OBSERVATION_BOUNDARY_MS = 1_000;
const REPETITIONS_PER_CONDITION = 10;
const PROVIDER_TIMEOUT_MS = 100;

const logger = {
  child() {
    return logger;
  },
  debug() {},
  error() {},
  info() {},
};

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server, sockets) {
  return new Promise((resolve) => {
    server.close(resolve);
    for (const socket of sockets) {
      socket.destroy();
    }
  });
}

async function observeProvider(condition, runNumber) {
  let requestSeen = false;
  const sockets = new Set();
  const server = createServer((request, response) => {
    requestSeen = true;
    request.resume();
    if (condition === "responsive") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ state: "active" }));
    }
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });

  await listen(server);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Fixture server did not expose a TCP port.");
  }

  const provider = new DaytonaSandboxProvider({
    apiKey: "verdict-fixture-key",
    apiUrl: `http://127.0.0.1:${address.port}`,
    autoArchiveIntervalInMinutes: 1,
    autoDeleteIntervalInMinutes: 1,
    autoStopIntervalInMinutes: 1,
    buildRef: "verdict-snapshot",
    client: {},
    fileMaxBytesForDownload: 1,
    logger,
    sandboxImage: "registry.invalid/verdict:fixture",
    tenantName: "verdict",
    timeoutMs: PROVIDER_TIMEOUT_MS,
  });

  const startedAt = new Date().toISOString();
  const started = performance.now();
  let responseState = null;
  let settlement = "pending";
  const providerCall = provider.registerSnapshot().then(
    (result) => {
      responseState = result.state;
      settlement = "resolved";
    },
    () => {
      settlement = "rejected";
    },
  );

  await Promise.race([
    providerCall,
    new Promise((resolve) => setTimeout(resolve, OBSERVATION_BOUNDARY_MS)),
  ]);
  const observedSettlement = settlement;
  const observedResponseState = responseState;
  const durationMs = Math.round(performance.now() - started);

  await close(server, sockets);
  await providerCall;

  const stalled = condition === "stalled";
  return {
    durationMs,
    outputExcerpt: stalled
      ? `POST /snapshots observed; provider call remained pending for ${OBSERVATION_BOUNDARY_MS} ms`
      : `POST /snapshots observed; provider resolved with state ${observedResponseState ?? "unknown"}`,
    requestSeen,
    responseState: observedResponseState,
    runId: `${condition}-${String(runNumber).padStart(2, "0")}`,
    settlement: observedSettlement,
    startedAt,
  };
}

async function runCondition(condition) {
  const observations = [];
  for (let runNumber = 1; runNumber <= REPETITIONS_PER_CONDITION; runNumber += 1) {
    observations.push(await observeProvider(condition, runNumber));
  }
  return observations;
}

const stalled = await runCondition("stalled");
const responsive = await runCondition("responsive");

if (
  stalled.some(
    (observation) =>
      !observation.requestSeen || observation.settlement !== "pending",
  )
) {
  throw new Error("The stalled condition did not produce a stable provider hang.");
}
if (
  responsive.some(
    (observation) =>
      !observation.requestSeen || observation.settlement !== "resolved",
  )
) {
  throw new Error("The responsive contrast did not resolve consistently.");
}

console.log(
  JSON.stringify({
    kind: "verdict.reproduction-observations",
    schemaVersion: 1,
    sourceManifestId: "trueforge-417-v1",
    package: "@truefoundry/trueforge-core@0.1.4",
    issueCommit: "506bf5c4d1540fa7cb086f1fb697bbe66d1ea5d4",
    provider: {
      className: "DaytonaSandboxProvider",
      module: "@truefoundry/trueforge-core/core",
    },
    environment: {
      arch: process.arch,
      node: process.version,
      platform: process.platform,
      providerTimeoutMs: String(PROVIDER_TIMEOUT_MS),
    },
    observationBoundaryMs: OBSERVATION_BOUNDARY_MS,
    conditions: [
      {
        conditionId: "daytona-stalled-endpoint",
        observations: stalled,
      },
      {
        conditionId: "daytona-responsive-endpoint",
        observations: responsive,
      },
    ],
  }),
);
