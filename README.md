# Verdict

**Bugs are innocent until reproduced.**

Verdict is an evidence-first reproduction agent for intermittent software failures. It searches a bounded condition space, records every valid run and stops before any public write until a human approves the exact action.

Built for the WeMakeDevs Agent Harness Hackathon. The implementation and its review history are preserved in [PR #1](https://github.com/himanshu748/verdict/pull/1), including Qodo's findings, remediations and resolved review threads.

## Three-act workflow

1. **Hunter** models a bounded condition matrix and preserves every valid, partial and unresolved observation.
2. **Surgeon** narrows history to a defensible suspect range, promoting it to a runtime boundary only when execution establishes polarity.
3. **Insurance** defines the regression plan and stops at an exact approval gate before any reviewed publication workflow can run.

Agents investigate and deterministic reducers decide. The maintainer controls the only public write.

## What works today

- A deterministic evidence protocol for valid, duplicate and mixed-run rejection
- A TrueForge sidecar configuration with bounded Hunter, Surgeon and Insurance instructions
- A read-only GitHub MCP surface with one approval-required workflow-dispatch tool
- A versioned conceptual demo for TrueForge issue #417, clearly separated from live execution
- Reducer-derived simulated reproduction views and a static-diff suspect range
- Downloadable `VERDICT.md` and `verdict.json` demo artifacts

The demo case uses generated records, generated durations and generated outcomes to demonstrate the product and reducer contracts. Verdict has not executed those records against Daytona or the TrueForge repository. Live repository execution requires a configured TrueForge model, GitHub token and target workflow. An approved workflow dispatch does not create a pull request unless that reviewed workflow explicitly does so.

For issue #417, static diff inspection identifies `69237db843c2951d30335b1763e31b869be7fe88` as a suspect because it introduces the raw awaited snapshot registration fetch. Its immediate parent is `f7a0a181a87e025c925f2cbe604e164db99323d5`. This is a static-diff suspect range, not demonstrated runtime polarity.

The documented test plan would extend the repository's existing Jest file at `packages/trueforge-core/tests/core/sandbox/daytonaSnapshotRegistration.test.ts`. Its selected proposed parameterized command is:

```bash
VERDICT_SCENARIO=SNAPSHOT_REGISTRATION VERDICT_REQUEST_BUDGET_MS=750 VERDICT_UPSTREAM_BEHAVIOR=NO_RESPONSE pnpm --filter @truefoundry/trueforge-core test -- tests/core/sandbox/daytonaSnapshotRegistration.test.ts --runInBand
```

That proposed parameterized timeout fixture has not been added to the existing file or run by Verdict.

## Review evidence

- [Qodo's review summary](https://github.com/himanshu748/verdict/pull/1#issuecomment-5407889215) was updated through the final reviewed commit
- All six Qodo review threads were resolved before merge
- GitHub CI runs lint, typecheck, tests and the production build from a clean checkout
- GitGuardian checks the pull request for exposed secrets

## Workspace

```text
apps/web          Next.js product and landing experience
apps/agent        TrueForge sidecar, MCP policy and event projection
packages/protocol Deterministic schemas and reducers
```

## Local development

Requirements: Node 22.14 or newer and Corepack.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Set `NEXT_PUBLIC_SITE_URL` to the public origin for production social metadata. Vercel deployments also derive it from `VERCEL_PROJECT_PRODUCTION_URL` or `VERCEL_URL`. The localhost fallback is for local development only.

Run all checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Safety boundary

Issue text, repository content and command output are untrusted data. Commands and allowed condition knobs come from a user-confirmed repository contract. GitHub credentials remain in the local connector configuration. The only write-capable MCP tool is workflow dispatch and TrueForge must pause it for explicit human approval. Draft PR creation is intentionally unavailable until a reviewed target workflow and exact-argument approval UI are connected.

## License

MIT
