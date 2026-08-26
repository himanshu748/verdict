import type { WorkflowDispatchTarget } from "./session.js";

const GITHUB_API_ROOT = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const DEFAULT_MAX_POLLS = 360;
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const PROOF_KIND = "VERDICT_WORKFLOW_PROOF";
const PROOF_MODE = "INTEGRATION_PROOF";
const PROOF_COMMAND = "pnpm --filter @verdict/agent test";
const PROOF_WORKFLOW_NAME = "Verdict approved investigation proof";

export type GitHubFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

interface WorkflowRunRecord {
  conclusion: string | null;
  displayTitle: string;
  event: string;
  headBranch: string;
  headSha: string;
  id: number;
  runAttempt: number;
  status: string;
  url: string;
}

interface PullRequestRecord {
  baseRef: string;
  draft: boolean;
  headRef: string;
  headSha: string;
  number: number;
  url: string;
}

interface PullRequestFileRecord {
  filename: string;
  sha: string;
  status: string;
}

export interface WorkflowRunBaseline {
  runIds: ReadonlySet<number>;
  targetHeadSha: string;
}

export interface ConfirmedWorkflowProof {
  workflowRun: {
    attempt: number;
    commitSha: string;
    conclusion: "success";
    id: number;
    url: string;
  };
  draftPullRequest: {
    baseRef: string;
    headRef: string;
    headSha: string;
    number: number;
    url: string;
  };
  proofArtifact: {
    approvalNonce: string;
    blobSha: string;
    path: string;
    sourceIssue: string;
    sourceIssueRuntimeReproduced: false;
    verificationOutcome: "PASSED";
  };
}

export interface WorkflowProofPollingOptions {
  fetchImpl?: GitHubFetch;
  maxPolls?: number;
  pollIntervalMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface ApprovedWorkflowProofResult<T> {
  approvalResult: T;
  proof: ConfirmedWorkflowProof;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireFineGrainedToken(token: string): string {
  const normalized = token.trim();
  if (!normalized.startsWith("github_pat_")) {
    throw new Error("GITHUB_TOKEN must be a fine-grained personal access token.");
  }
  return normalized;
}

function encodePathSegment(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized || normalized !== value) {
    throw new Error(`${field} must be a non-empty, normalized string.`);
  }
  return encodeURIComponent(normalized);
}

function repositoryApiRoot(target: WorkflowDispatchTarget): string {
  const owner = encodePathSegment(target.owner, "workflow owner");
  const repo = encodePathSegment(target.repo, "workflow repository");
  return `${GITHUB_API_ROOT}/repos/${owner}/${repo}`;
}

function workflowRunsUrl(target: WorkflowDispatchTarget): string {
  const workflowId = encodePathSegment(target.workflowId, "workflow ID");
  const url = new URL(
    `${repositoryApiRoot(target)}/actions/workflows/${workflowId}/runs`,
  );
  url.searchParams.set("branch", target.ref);
  url.searchParams.set("event", "workflow_dispatch");
  url.searchParams.set("per_page", "20");
  return url.toString();
}

function targetRefUrl(target: WorkflowDispatchTarget): string {
  return `${repositoryApiRoot(target)}/git/ref/heads/${encodePathSegment(target.ref, "workflow ref")}`;
}

function pullRequestsUrl(
  target: WorkflowDispatchTarget,
  headRef: string,
): string {
  const url = new URL(`${repositoryApiRoot(target)}/pulls`);
  url.searchParams.set("state", "open");
  url.searchParams.set("head", `${target.owner}:${headRef}`);
  url.searchParams.set("base", target.ref);
  url.searchParams.set("per_page", "20");
  return url.toString();
}

function compareCommitsUrl(
  target: WorkflowDispatchTarget,
  baseSha: string,
  headSha: string,
): string {
  const base = encodePathSegment(baseSha, "base commit SHA");
  const head = encodePathSegment(headSha, "head commit SHA");
  return `${repositoryApiRoot(target)}/compare/${base}...${head}`;
}

function gitCommitUrl(
  target: WorkflowDispatchTarget,
  commitSha: string,
): string {
  return `${repositoryApiRoot(target)}/git/commits/${encodePathSegment(commitSha, "commit SHA")}`;
}

function gitBlobUrl(target: WorkflowDispatchTarget, blobSha: string): string {
  return `${repositoryApiRoot(target)}/git/blobs/${encodePathSegment(blobSha, "blob SHA")}`;
}

async function requestGitHubJson(
  url: string,
  token: string,
  fetchImpl: GitHubFetch,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed with HTTP ${response.status}.`);
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new Error("GitHub API returned an invalid JSON response.");
  }
}

function parseWorkflowRun(value: unknown): WorkflowRunRecord {
  if (!isRecord(value)) {
    throw new Error("GitHub API returned an invalid workflow run.");
  }

  const {
    conclusion,
    display_title: displayTitle,
    event,
    head_branch: headBranch,
    head_sha: headSha,
    html_url: url,
    id,
    run_attempt: runAttempt,
    status,
  } = value;
  if (
    !Number.isSafeInteger(id) ||
    !Number.isSafeInteger(runAttempt) ||
    (runAttempt as number) < 1 ||
    typeof displayTitle !== "string" ||
    typeof event !== "string" ||
    typeof headBranch !== "string" ||
    typeof headSha !== "string" ||
    typeof status !== "string" ||
    (conclusion !== null && typeof conclusion !== "string") ||
    typeof url !== "string"
  ) {
    throw new Error("GitHub API returned an invalid workflow run.");
  }

  return {
    conclusion: conclusion as string | null,
    displayTitle,
    event,
    headBranch,
    headSha,
    id: id as number,
    runAttempt: runAttempt as number,
    status,
    url,
  };
}

function parseWorkflowRuns(value: unknown): WorkflowRunRecord[] {
  if (!isRecord(value) || !Array.isArray(value.workflow_runs)) {
    throw new Error("GitHub API returned an invalid workflow run list.");
  }
  return value.workflow_runs.map(parseWorkflowRun);
}

function parseTargetHeadSha(value: unknown): string {
  if (
    !isRecord(value) ||
    !isRecord(value.object) ||
    value.object.type !== "commit" ||
    typeof value.object.sha !== "string" ||
    !value.object.sha
  ) {
    throw new Error("GitHub API returned an invalid target branch reference.");
  }
  return value.object.sha;
}

function parsePullRequest(value: unknown): PullRequestRecord {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.number) ||
    typeof value.html_url !== "string" ||
    typeof value.draft !== "boolean" ||
    !isRecord(value.head) ||
    typeof value.head.ref !== "string" ||
    typeof value.head.sha !== "string" ||
    !isRecord(value.base) ||
    typeof value.base.ref !== "string"
  ) {
    throw new Error("GitHub API returned an invalid pull request.");
  }

  return {
    baseRef: value.base.ref,
    draft: value.draft,
    headRef: value.head.ref,
    headSha: value.head.sha,
    number: value.number as number,
    url: value.html_url,
  };
}

function parsePullRequests(value: unknown): PullRequestRecord[] {
  if (!Array.isArray(value)) {
    throw new Error("GitHub API returned an invalid pull request list.");
  }
  return value.map(parsePullRequest);
}

function parsePullRequestFiles(value: unknown): PullRequestFileRecord[] {
  if (!Array.isArray(value)) {
    throw new Error("GitHub API returned an invalid pull request file list.");
  }
  return value.map((file) => {
    if (
      !isRecord(file) ||
      typeof file.filename !== "string" ||
      typeof file.sha !== "string" ||
      typeof file.status !== "string"
    ) {
      throw new Error("GitHub API returned an invalid pull request file.");
    }
    return { filename: file.filename, sha: file.sha, status: file.status };
  });
}

function parsePinnedProofComparison(
  value: unknown,
  expectedHeadSha: string,
): PullRequestFileRecord[] {
  if (
    !isRecord(value) ||
    value.status !== "ahead" ||
    value.ahead_by !== 1 ||
    value.total_commits !== 1 ||
    !Array.isArray(value.commits) ||
    value.commits.length !== 1 ||
    !isRecord(value.commits[0]) ||
    value.commits[0].sha !== expectedHeadSha ||
    !Array.isArray(value.files)
  ) {
    throw new Error(
      "The proof comparison is not pinned to the draft PR head.",
    );
  }
  return parsePullRequestFiles(value.files);
}

function parseSingleParentCommit(value: unknown, expectedSha: string): string {
  if (
    !isRecord(value) ||
    value.sha !== expectedSha ||
    !Array.isArray(value.parents) ||
    value.parents.length !== 1 ||
    !isRecord(value.parents[0]) ||
    typeof value.parents[0].sha !== "string"
  ) {
    throw new Error("The proof PR head is not the expected single commit.");
  }
  return value.parents[0].sha;
}

function decodeBlob(value: unknown): string {
  if (
    !isRecord(value) ||
    value.encoding !== "base64" ||
    typeof value.content !== "string"
  ) {
    throw new Error("GitHub API returned an invalid proof blob.");
  }

  const encoded = value.content.replace(/\s/g, "");
  const decoded = Buffer.from(encoded, "base64");
  const normalizedInput = encoded.replace(/=+$/, "");
  const normalizedRoundTrip = decoded.toString("base64").replace(/=+$/, "");
  if (normalizedInput !== normalizedRoundTrip) {
    throw new Error("GitHub API returned invalid base64 proof content.");
  }
  return decoded.toString("utf8");
}

function parseAndValidateProofDocument(
  content: string,
  target: WorkflowDispatchTarget,
  run: WorkflowRunRecord,
  expectedSourceIssue: string,
): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new Error("The proof artifact is not valid JSON.");
  }
  if (!isRecord(parsed)) {
    throw new Error("The proof artifact must be a JSON object.");
  }

  const expectedKeys = [
    "approvalNonce",
    "commit",
    "createdAt",
    "evidenceMode",
    "kind",
    "runAttempt",
    "runId",
    "schemaVersion",
    "sourceIssue",
    "sourceIssueRuntimeReproduced",
    "verificationCommand",
    "verificationOutcome",
    "workflow",
  ].sort();
  if (JSON.stringify(Object.keys(parsed).sort()) !== JSON.stringify(expectedKeys)) {
    throw new Error("The proof artifact has missing or unexpected fields.");
  }

  const checks: Array<[string, unknown, unknown]> = [
    ["schemaVersion", parsed.schemaVersion, 1],
    ["kind", parsed.kind, PROOF_KIND],
    ["evidenceMode", parsed.evidenceMode, PROOF_MODE],
    ["approvalNonce", parsed.approvalNonce, target.approvalNonce],
    ["sourceIssue", parsed.sourceIssue, expectedSourceIssue],
    ["sourceIssueRuntimeReproduced", parsed.sourceIssueRuntimeReproduced, false],
    ["verificationCommand", parsed.verificationCommand, PROOF_COMMAND],
    ["verificationOutcome", parsed.verificationOutcome, "PASSED"],
    ["workflow", parsed.workflow, PROOF_WORKFLOW_NAME],
    ["runId", parsed.runId, run.id],
    ["runAttempt", parsed.runAttempt, run.runAttempt],
    ["commit", parsed.commit, run.headSha],
  ];
  const mismatch = checks.find(([, actual, expected]) => actual !== expected);
  if (mismatch) {
    throw new Error(`The proof artifact field ${mismatch[0]} is invalid.`);
  }
  if (
    typeof parsed.createdAt !== "string" ||
    !Number.isFinite(Date.parse(parsed.createdAt))
  ) {
    throw new Error("The proof artifact field createdAt is invalid.");
  }
}

async function listWorkflowRuns(
  token: string,
  target: WorkflowDispatchTarget,
  fetchImpl: GitHubFetch,
): Promise<WorkflowRunRecord[]> {
  const response = await requestGitHubJson(
    workflowRunsUrl(target),
    token,
    fetchImpl,
  );
  return parseWorkflowRuns(response).filter(
    (run) => run.event === "workflow_dispatch" && run.headBranch === target.ref,
  );
}

export async function captureWorkflowRunBaseline(
  githubToken: string,
  target: WorkflowDispatchTarget,
  fetchImpl: GitHubFetch = (input, init) => fetch(input, init),
): Promise<WorkflowRunBaseline> {
  const token = requireFineGrainedToken(githubToken);
  const runs = await listWorkflowRuns(token, target, fetchImpl);
  const targetRef = await requestGitHubJson(
    targetRefUrl(target),
    token,
    fetchImpl,
  );
  return {
    runIds: new Set(runs.map((run) => run.id)),
    targetHeadSha: parseTargetHeadSha(targetRef),
  };
}

function expectedProofHeadRef(
  target: WorkflowDispatchTarget,
  run: WorkflowRunRecord,
): string {
  return `verdict/proof-${run.id}-${run.runAttempt}-${target.approvalNonce}`;
}

function expectedProofPath(
  target: WorkflowDispatchTarget,
  run: WorkflowRunRecord,
): string {
  return `.verdict/proofs/run-${run.id}-${run.runAttempt}-${target.approvalNonce}.json`;
}

async function findExactDraftPull(
  token: string,
  target: WorkflowDispatchTarget,
  run: WorkflowRunRecord,
  fetchImpl: GitHubFetch,
): Promise<PullRequestRecord | null> {
  const headRef = expectedProofHeadRef(target, run);
  const response = await requestGitHubJson(
    pullRequestsUrl(target, headRef),
    token,
    fetchImpl,
  );
  const matching = parsePullRequests(response).filter(
    (pull) =>
      pull.draft && pull.headRef === headRef && pull.baseRef === target.ref,
  );
  if (matching.length > 1) {
    throw new Error(
      "More than one exact draft proof PR matched the completed workflow run.",
    );
  }
  return matching[0] ?? null;
}

async function verifyProofPull(
  token: string,
  target: WorkflowDispatchTarget,
  run: WorkflowRunRecord,
  pull: PullRequestRecord,
  expectedSourceIssue: string,
  fetchImpl: GitHubFetch,
): Promise<ConfirmedWorkflowProof> {
  const expectedPath = expectedProofPath(target, run);
  const comparisonResponse = await requestGitHubJson(
    compareCommitsUrl(target, run.headSha, pull.headSha),
    token,
    fetchImpl,
  );
  const files = parsePinnedProofComparison(comparisonResponse, pull.headSha);
  if (
    files.length !== 1 ||
    files[0]?.filename !== expectedPath ||
    files[0]?.status !== "added"
  ) {
    throw new Error("The draft PR must contain exactly one added proof file.");
  }
  const proofFile = files[0];

  const commitResponse = await requestGitHubJson(
    gitCommitUrl(target, pull.headSha),
    token,
    fetchImpl,
  );
  const parentSha = parseSingleParentCommit(commitResponse, pull.headSha);
  if (parentSha !== run.headSha) {
    throw new Error(
      "The proof PR commit is not based directly on the verified workflow commit.",
    );
  }

  const blobResponse = await requestGitHubJson(
    gitBlobUrl(target, proofFile.sha),
    token,
    fetchImpl,
  );
  parseAndValidateProofDocument(
    decodeBlob(blobResponse),
    target,
    run,
    expectedSourceIssue,
  );

  return {
    workflowRun: {
      id: run.id,
      attempt: run.runAttempt,
      url: run.url,
      conclusion: "success",
      commitSha: run.headSha,
    },
    draftPullRequest: {
      number: pull.number,
      url: pull.url,
      headRef: pull.headRef,
      headSha: pull.headSha,
      baseRef: pull.baseRef,
    },
    proofArtifact: {
      path: proofFile.filename,
      blobSha: proofFile.sha,
      approvalNonce: target.approvalNonce,
      sourceIssue: expectedSourceIssue,
      sourceIssueRuntimeReproduced: false,
      verificationOutcome: "PASSED",
    },
  };
}

export async function confirmWorkflowProof(
  githubToken: string,
  target: WorkflowDispatchTarget,
  baseline: WorkflowRunBaseline,
  expectedSourceIssue: string,
  options: WorkflowProofPollingOptions = {},
): Promise<ConfirmedWorkflowProof> {
  const token = requireFineGrainedToken(githubToken);
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const maxPolls = options.maxPolls ?? DEFAULT_MAX_POLLS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const sleep =
    options.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));

  if (!Number.isSafeInteger(maxPolls) || maxPolls < 1) {
    throw new Error("maxPolls must be a positive integer.");
  }
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 0) {
    throw new Error("pollIntervalMs must be a non-negative integer.");
  }
  if (!expectedSourceIssue.startsWith("https://github.com/")) {
    throw new Error("expectedSourceIssue must be an HTTPS GitHub issue URL.");
  }

  let candidateRunId: number | null = null;
  let waitingForDraftPr = false;
  const expectedTitle = `Verdict proof ${target.approvalNonce}`;

  for (let poll = 0; poll < maxPolls; poll += 1) {
    const runs = await listWorkflowRuns(token, target, fetchImpl);
    const newRuns = runs.filter(
      (run) =>
        !baseline.runIds.has(run.id) && run.displayTitle === expectedTitle,
    );

    if (newRuns.length > 1) {
      throw new Error(
        "More than one new nonce-bound workflow run appeared after approval.",
      );
    }

    if (newRuns.length === 1) {
      const run = newRuns[0]!;
      if (candidateRunId !== null && candidateRunId !== run.id) {
        throw new Error(
          "The nonce-bound workflow run changed while proof was being verified.",
        );
      }
      candidateRunId = run.id;
      if (run.runAttempt !== 1) {
        throw new Error(
          "The nonce-bound run is not the first workflow attempt and cannot prove a fresh approval.",
        );
      }
      if (run.headSha !== baseline.targetHeadSha) {
        throw new Error(
          "The nonce-bound workflow run does not match the pre-approval target commit.",
        );
      }

      if (run.status === "completed") {
        if (run.conclusion !== "success") {
          throw new Error(
            `Workflow run ${run.id} completed with conclusion ${run.conclusion ?? "unknown"}. Evidence: ${run.url}`,
          );
        }

        waitingForDraftPr = true;
        const pull = await findExactDraftPull(
          token,
          target,
          run,
          fetchImpl,
        );
        if (pull) {
          return verifyProofPull(
            token,
            target,
            run,
            pull,
            expectedSourceIssue,
            fetchImpl,
          );
        }
      }
    }

    if (poll < maxPolls - 1) {
      await sleep(pollIntervalMs);
    }
  }

  if (waitingForDraftPr) {
    throw new Error("Timed out waiting for the exact draft proof PR.");
  }
  throw new Error("Timed out waiting for the nonce-bound workflow run.");
}

/**
 * Establishes an authoritative before-state before the supplied callback can
 * perform the approved write, then confirms the resulting GitHub run and PR.
 */
export async function executeApprovedWorkflowWithProof<T>(
  githubToken: string,
  target: WorkflowDispatchTarget,
  expectedSourceIssue: string,
  approve: () => Promise<T>,
  options: WorkflowProofPollingOptions = {},
): Promise<ApprovedWorkflowProofResult<T>> {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const baseline = await captureWorkflowRunBaseline(
    githubToken,
    target,
    fetchImpl,
  );
  const approvalResult = await approve();
  const proof = await confirmWorkflowProof(
    githubToken,
    target,
    baseline,
    expectedSourceIssue,
    { ...options, fetchImpl },
  );
  return { approvalResult, proof };
}
