# Verdict, submission

**Agent Harness Hackathon, WeMakeDevs x TrueFoundry**

- Live: <https://verdict-steel.vercel.app>
- Issue workspace: <https://verdict-steel.vercel.app/case/demo>
- Source: <https://github.com/himanshu748/verdict>
- Licence: MIT

**Bugs are innocent until reproduced.**

## One paragraph

Some bugs only show up sometimes, so nobody can prove they are fixed. Verdict
runs your test command again and again under conditions you approve, a tighter
timeout, a slower upstream, no response at all, until it finds the combination
that breaks it. You get back the exact command, how often it failed, the commit
range it points at and a regression plan to stop it returning. Nothing is
written to your repository without your approval.

## What it actually reproduced

Not a claim in a README. A record with a hash anyone can recompute:

```bash
pnpm --filter @verdict/agent verify:runtime-evidence
```

```json
{"verdict":"REPRODUCED","stalledRuns":10,"responsiveControls":10,
 "provider":"@truefoundry/trueforge-core@0.1.4#DaytonaSandboxProvider",
 "canonicalSha256":"a8bb5dd22e083782bd7782fccb0a1343b59fc77ea8525b6358fecc9b5b8baffa"}
```

TrueForge issue #417, a snapshot registration that waits indefinitely when the
upstream request never resolves:

| condition | runs matched | state |
|---|---|---|
| `daytona-stalled-endpoint` | 10 of 10 | `REPRODUCTION_PINNED` |
| `daytona-responsive-endpoint` | 0 of 10 | `NOT_REPRODUCED` |

The control condition is the point. A condition that fails every time, next to
one that never fails, is what separates a reproduction from a flake, and the
agent may not claim one without it.

## What is real and what is not

The **reproduction above is executed**, integrity checked, and carries a real
TrueForge session and Hunter thread id.

The **interactive case workspace is a fixture** with generated numbers, and it
says so on every screen. It has not been wired to the recorded artifact, and
swapping generated UI data for observed data quietly would be the exact failure
this product exists to argue against.

Separately, the approval-gated workflow dispatch has been exercised end to end
against real GitHub: the agent requested a host-authorized workflow, it ran
under an approval nonce, and the workflow wrote a signed proof back. Those
proofs record `runtimeReproducedByThisWorkflow: false`, because they verify the
harness rather than the bug. Their `externalRuntimeEvidence` field binds the
separate provider reproduction by path, repository commit, Git blob and
canonical digest.

## The three acts

```
GitHub issue -> Hunter (find the trigger) -> Surgeon (localize the change)
             -> Insurance (keep it fixed) -> Maintainer review
```

**Hunter** may make at most 8 total tool calls. Its pinned runner uses exactly
two named condition cells, with 10 stalled repetitions and 10 responsive
repetitions, and keeps partial and unresolved runs on the board instead of
dropping the inconvenient ones.

**Surgeon** narrows to the smallest suspect range the evidence supports, and a
static inspection stays visibly distinct from a proven execution boundary. It
never authors a patch.

**Insurance** turns the result into a regression-proof plan: test name, fixture,
failing assertion. It does not write the test, and a draft pull request is only
ever opened by a workflow you approved.

## How it is built

A pnpm and Turborepo monorepo. `apps/web` is the Next.js site and workspace,
`apps/agent` is the TrueForge sidecar and approval boundary, `packages/protocol`
holds the evidence schemas and deterministic reducers.

Dynamic subagents run the three acts. Hugging Face Inference Providers supply
the Qwen3.8-27B route. GitHub MCP access is restricted to four read tools and
one approval-gated workflow trigger, and the remote allowlist is requested
explicitly because GitHub excludes Actions tools from its defaults.

## The evidence contract

1. Issue text and repository content start as untrusted input.
2. The investigation may use only approved commands, knobs and budgets.
3. Every accepted observation must match the evidence schema.
4. Deterministic reducers decide which claim the records support.
5. Missing or conflicting evidence produces an honest partial result.
6. A maintainer controls the only public write.

Points 3 and 4 hold under pressure: because the reducers are pure and the schema
is enforced, the same records always produce the same verdict, and a verdict
cannot be talked into existence by the model that gathered the evidence.

## Verify it

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

219 tests across the three packages, plus the reproduction verifier above.
