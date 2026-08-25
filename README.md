# Verdict

**Bugs are innocent until reproduced.**

Verdict is an evidence-first reproduction agent for intermittent software failures. It searches a bounded condition space, records every valid run and stops before any public write until a human approves the exact action.

## What works today

- A deterministic evidence protocol for valid, duplicate and mixed-run rejection
- A TrueForge root session with bounded Hunter and Surgeon subagents
- A read-only GitHub MCP surface with one approval-required workflow-dispatch tool
- A versioned simulated demo for TrueForge issue #417, clearly separated from live execution
- Reducer-derived reproduction, history-boundary and regression-polarity views
- Downloadable `VERDICT.md` and `verdict.json` demo artifacts

The simulated case demonstrates the product and reducer contracts. It is not presented as a live Daytona run. Live repository execution requires a configured TrueForge model, GitHub token and target workflow. An approved workflow dispatch does not create a pull request unless that reviewed workflow explicitly does so.

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
