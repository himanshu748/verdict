# Agent Harness Hackathon: form answers and video plan

Form: https://docs.google.com/forms/d/e/1FAIpQLSd2DDM-F0BJUqxu8if-XjCZufWH_mRVOlZTYAqsQXL2cNdjYA/viewform

Two projects, two submissions. Fill the form once per project.

---

## Video requirements, verbatim from the form

> The video should be not be more than 3 minutes covering how your project
> reflects the below points: About the project, Tech stack and architecture,
> Demo if possible, Learning and growth (optional)

- **Hard cap: 3 minutes.** Going over is the easiest avoidable loss.
- **YouTube link required.** Unlisted is fine, but not Private: a judge with
  the link must be able to play it without requesting access.
- Cover, in order: what it is, how it is built, it working.

---

# Verdict

**Track:** Best Use of TrueForge
**GitHub:** https://github.com/himanshu748/verdict
**Deployed:** https://verdict-steel.vercel.app

## What does your project do?

Verdict finds the exact condition under which a bug reproduces, and refuses to
claim anything it did not observe. You give it an issue and a test command. It
runs that command repeatedly across conditions you approved, records every run,
and reports the combination that fails together with the one that does not.

The intended users are maintainers triaging "cannot reproduce" issues, where the
cost is not fixing the bug but proving it exists. A condition that fails 10 times
out of 10, next to a control that fails 0 times out of 10, is the difference
between a reproduction and a flake, and that contrast is what Verdict is built
to produce.

Every claim carries its evidence: the command, the commit, the environment, and
each run record. What it could not establish is marked as such rather than
quietly omitted.

## How did you use TrueForge in your project?

The agent runs on TrueForge across three acts, each allowed to claim less than
the last.

- **Sandboxed execution.** The reproduction ran inside the configured TrueForge
  Daytona sandbox against pinned `@truefoundry/trueforge-core@0.1.4`. Hunter
  invoked `DaytonaSandboxProvider.registerSnapshot()` through the exact
  host-owned command, not a model-authored `fetch` imitation, so what was
  observed is the real provider path.
- **Human approval before irreversible action.** Publishing evidence back to
  GitHub passes through the TrueForge approval gate. The agent cannot open a
  pull request on its own; a maintainer decides, and only then is a nonce-bound
  target dispatched.
- **Persistent sessions and subagents.** The record binds to TrueForge session
  `01m16a555jy0b09pp9ze5296ng` and Hunter thread
  `8ed4cc99-7c90-48df-bc39-f237c55761af`. Hunter reproduces, Surgeon runs a
  bounded history pass, Insurance takes the result to the approval gate.
- **Real MCP tools.** Four read-only GitHub tools, no write path outside the
  gate.

The output is a signed artifact, not a transcript:
`evidence/trueforge-417/reproduction.json`, verdict `REPRODUCED`,
`daytona-stalled-endpoint` 10 of 10 against `daytona-responsive-endpoint` 0 of
10, canonical digest
`a8bb5dd22e083782bd7782fccb0a1343b59fc77ea8525b6358fecc9b5b8baffa`. CI
recomputes that digest on `main` and every pull request, so the headline claim
is checked rather than asserted.

## How did you use Qodo in your project?

Every substantive change went through a pull request reviewed by Qodo before
merge, twenty merged in total. Twice it caught a claim rather than a crash,
which for this project is the worse kind.

- **[#21](https://github.com/himanshu748/verdict/pull/21)** the landing page
  still read `SIMULATED_REPRODUCTION_PINNED` with runtime proof not established,
  hours after the recorded reproduction had landed the same day. Fixed to show
  what was executed, while keeping the line between the executed record and the
  clickable fixture.
- **[#24](https://github.com/himanshu748/verdict/pull/24)** CI ran lint,
  typecheck, 220 tests and a build, then took the recorded verdict on faith. It
  now recomputes the reproduction hash. Qodo then caught the pull request's own
  wording: it claimed verification on every push when the trigger is `main` plus
  pull requests. The wording was corrected rather than the trigger widened.
- **[#26](https://github.com/himanshu748/verdict/pull/26)** the record page
  printed a 16 character hash prefix while the README said it showed the
  integrity hash, and the review write-up said a stale claim had survived
  "months" when it had survived hours. Both corrected.

## Three minute script

| Time | On screen | Say |
|---|---|---|
| 0:00-0:20 | `/case/trueforge-417` | This is an executed reproduction of TrueForge issue 417. Not a mockup. Verdict `REPRODUCED`, and this hash is recomputed by CI on every pull request. |
| 0:20-0:50 | Scroll to the two condition cards | The failing condition reproduced on 10 of 10 runs. The control, same command, same count, reproduced on 0 of 10. That contrast is what separates a reproduction from a flake, and Verdict will not claim one without it. |
| 0:50-1:20 | Scroll the run table, open the command block | Twenty runs, each with its exit code, duration and what was observed, against a pinned commit. This is the command every run executed. |
| 1:20-2:00 | Draft PR #18 and the approval gate | Verdict cannot publish this on its own. Evidence goes back to GitHub only through the TrueForge approval gate. A maintainer approves, then a nonce-bound target is dispatched, and the run is verified independently at the PR head. |
| 2:00-2:30 | `/case/demo` workspace | This is the interface over that evidence: conditions, phases, the evidence ledger. It is a fixture with generated numbers and it says so on every screen, because a tool arguing that claims need records cannot present modelled data as observation. |
| 2:30-3:00 | Terminal: `pnpm --filter @verdict/agent verify:runtime-evidence` | Everything I claimed is checkable. This recomputes the digest from the artifact. Same value as the page. That is the whole point. |

**Open on the record, not the workspace.** The fixture label is honest, but a
judge who sees it first files the project as a mockup and never reaches the
proof.
