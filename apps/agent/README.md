# Verdict TrueForge sidecar

This package connects Verdict to a local TrueForge 0.1.x server. It registers Hugging Face Inference Providers, a remote GitHub MCP connector and the Verdict agent. It also starts streamed investigations and resumes approval pauses through a fail-closed policy boundary.

## Install and run

From the repository root:

```sh
pnpm install --filter @verdict/agent
cp apps/agent/.env.example apps/agent/.env
```

Fill in `GITHUB_TOKEN`, `HF_TOKEN` and `DAYTONA_API_KEY`. `GITHUB_TOKEN` must be a fine-grained PAT. Select only `himanshu748/verdict` when creating it. Verdict validates the token format but GitHub does not expose its selected-repository list through this setup path, so the operator must verify that scope. The Hugging Face token needs the **Make calls to Inference Providers** permission. `TRUEFORGE_MODEL` defaults to `huggingface/qwen3.8-27b`. `VERDICT_SOURCE_MANIFEST_ID` selects one audited host manifest. That single record binds the issue commit, exact package digest, immutable npm lock closure, npm SLSA provenance commit and shared vulnerable-file blob. Unknown manifests and repository or issue mismatches fail before a TrueForge session starts.

The setup command upserts a custom OpenAI-compatible provider at `https://router.huggingface.co/v1` and pins the TrueForge model to `Qwen/Qwen3.8-27B:deepinfra`. Hugging Face currently reports a 262,144-token context, tool-call support and structured-output support for that live route. Verdict caps each model response at 32,768 tokens and allows 64 TrueForge loop iterations for the ordered three-act investigation. Setup also configures TrueForge's Daytona provider with bounded execution and lifecycle settings. Then use two terminals:

```sh
pnpm --filter @verdict/agent server
```

```sh
pnpm --filter @verdict/agent run setup
```

Start the bounded investigation after setup:

```sh
pnpm --filter @verdict/agent investigate
```

The command streams observed TrueForge subagent events. If the model proposes the configured workflow, the command prints both the authoritative tool call and trusted host target. Only the exact phrase `APPROVE VERDICT WORKFLOW` allows it. `DENY` rejects the pending call. Any other input fails closed and leaves the turn paused. Each run receives a host-generated approval nonce. Before approval, the host snapshots matching workflow runs and the exact target commit. After approval, it accepts proof only when one new nonce-bound run tests that commit, creates a one-file draft PR and publishes an exact proof document whose contents match the GitHub run. Proof verification retries only idempotent GitHub reads, at most three times with bounded backoff. It never retries an approval decision or protected write.

The server command binds TrueForge to `127.0.0.1:8790`, gives long three-act investigations a one-hour server window and writes its standalone SQLite database inside `apps/agent`. Daytona runs commands with a separate three-minute cap, stops idle sandboxes after five minutes and deletes them after five days. TrueForge also creates local sandbox storage in the operating system's application-data directory. The SDK rejects non-loopback base URLs.

The CLI retries a transient provider connection failure at most twice after the first pre-approval attempt, with bounded exponential backoff. If the root model does not create its first required subagent within two minutes, Verdict aborts the stream, asks TrueForge to cancel that local session and treats the stall as transient. A transport error also triggers best-effort cancellation before retry. This retry boundary covers only a fresh investigation start. It never replays an approval decision or a protected GitHub write.

Insurance must produce a real TrueForge tool-approval event, not a prose imitation. The host accepts Hunter, Surgeon and Insurance by their observed dynamic-thread name or title and requires all three successful thread completions in order. A root fallback packet preserves evidence but cannot impersonate a missing thread. A completed run missing that structure becomes a terminal error and cannot request the proof workflow. If all three observed acts complete without an approval event and no workflow call was attempted, the CLI resumes the exact completed turn once with a host-owned request for the exact configured target. The corrective turn still cannot dispatch the workflow. It pauses for the same explicit maintainer decision, has a one-minute watchdog and fails closed if the model returns prose again.

Verdict permits at most one successful approved workflow dispatch per investigation. A failed or malformed workflow attempt that reaches a completed turn without a TrueForge approval event is a terminal error, not a successful run and not a reason to issue a second call. If the model requests another workflow after one confirmed proof, Verdict denies it, returns a terminal error projection and retains the first proof in the structured audit output.

## Policy boundary

The agent can see only `issue_read`, `get_file_contents`, `search_code`, `list_commits` and `actions_run_trigger`. The connector requests that exact allowlist through GitHub's `X-MCP-Tools` header because Actions tools are excluded from the remote server defaults. TrueForge requires explicit approval for `actions_run_trigger`. Its Daytona sandbox is enabled and agent-produced file downloads are disabled. Hunter receives one short host-generated command that downloads an immutable bootstrap script and verifies its SHA-256 digest before execution. The audited script requires a clean sandbox, installs an official checksum-pinned Node archive and consumes the checked-in npm v3 lock with `npm ci --ignore-scripts`. Every one of its 315 package entries has a fixed npm registry URL and sha512 integrity. A fatal `npm audit signatures` step verifies registry signatures and attestations.

The same bootstrap verifies the decoded SLSA payload for `@truefoundry/trueforge-core@0.1.4`. That payload binds the package digest to TrueForge commit `fba492fafd853e897793e8f5f6c5cbd1174e3676`. The reported issue is inspected at commit `506bf5c4d1540fa7cb086f1fb697bbe66d1ea5d4`. Verdict does not claim that the package was built from the issue commit. Instead it downloads the vulnerable `DaytonaProvider.ts` file at both commits and verifies the same Git blob, `1fba52e1673e560bce4aa897cb88000dfee75652`. The script contains no credential and does not clone a repository.

The host accepts reproduction evidence only after observing the exact bootstrap command succeed with its manifest-bound verification record. From that point through capture, every sandbox `exec` must be the original bootstrap followed only by the exact reproduction command, with no working-directory or environment overrides. The reproduction command rechecks the runner SHA-256 immediately before each execution. A provider call still pending at the observation boundary is recorded with `exitCode: null` and an explicit `PENDING_AT_BOUNDARY` observation, never a fabricated process exit.

The GitHub token is placed only in the connector's `Authorization` header. The Hugging Face token is placed only in the model-provider manifest. The Daytona key is placed only in redacted sandbox-provider settings. None of these secrets enters the agent manifest, session prompt or setup output.

The allow path retains each tool call from its authoritative `model.message` event and correlates the pending approval by source event ID, thread ID and tool call ID. It permits exactly one call from the configured GitHub connector, with method `run_workflow`, exact owner, repository, workflow ID, ref and approval nonce values and no additional arguments. Approval and denial resume the exact paused turn ID, never the session's newest automatic tip. The expected target is a trusted host policy passed to `approveVerdictWorkflow`. It must come from application configuration, never from model output, issue content or editable approval fields. Unresolved, duplicated or mismatched metadata fails closed. Bulk denial remains available and does not require trusted metadata because denial cannot execute the tool.

Dynamic subagents are enabled and the instructions bound Hunter, Surgeon and Insurance by evidence limits. TrueForge 0.1.x does not expose a policy that guarantees an exact subagent count. Consumers should project `thread.created` events and show what actually ran.

## Current limitations

- Unit tests validate local policy and approval authorization without starting TrueForge. A live server, configured model and GitHub MCP access are still required for an end-to-end run.
- `list_commits` supports bounded suspect-range analysis, not a real executable bisect.
- The reviewed `verdict-day4-proof.yml` workflow runs backend and recorded-runtime-evidence verification with read-only repository permissions. It pins the evidence path, Git blob, canonical digest, TrueForge session, Hunter thread and condition counts at the exact dispatch commit. A separate publication job executes no repository code, records an explicitly labelled integration proof and creates a draft PR through GitHub's API. The workflow must exist on `main`, and repository Actions settings must allow workflows to create pull requests, before dispatch.
- The bundled standalone SQLite mode is for a local hackathon demo, not production or multi-replica deployment.
- Token scope and repository workflow permissions still apply. The fine-grained token needs repository metadata read, contents read, issues read, actions read/write and pull requests read for the configured repository. Do not grant access to unrelated private repositories.
- GitHub MCP read-tool repository arguments are model-controlled. The fine-grained PAT's selected repositories are the enforcement boundary, not Verdict's token-prefix check.
- The current trusted source manifest supports an x86-64 Daytona sandbox and one audited TrueForge npm closure. Other cases need a new reviewed manifest and bootstrap rather than model-authored acquisition commands.

Run offline checks with:

```sh
pnpm --filter @verdict/agent typecheck
pnpm --filter @verdict/agent test
```
