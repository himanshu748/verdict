# Verdict TrueForge sidecar

This package connects Verdict to a local TrueForge 0.1.x server. It registers a remote GitHub MCP connector, upserts the Verdict agent, starts streamed investigations and resumes approval pauses as one validated batch.

## Install and run

From the repository root:

```sh
pnpm install --filter @verdict/agent
cp apps/agent/.env.example apps/agent/.env
```

Fill in `GITHUB_TOKEN` and `TRUEFORGE_MODEL`. Configure that model and its provider credentials in TrueForge Settings first. Then use two terminals:

```sh
pnpm --filter @verdict/agent server
```

```sh
pnpm --filter @verdict/agent setup
```

The server command binds TrueForge to `127.0.0.1:8790` and writes its standalone SQLite database inside `apps/agent`. TrueForge also creates local sandbox storage in the operating system's application-data directory. The SDK rejects non-loopback base URLs.

## Policy boundary

The agent can see only `issue_read`, `get_file_contents`, `search_code`, `list_commits` and `actions_run_trigger`. TrueForge requires explicit approval for `actions_run_trigger`. The GitHub token is placed only in the connector's `Authorization` header, never in the agent manifest or session prompt.

Dynamic subagents are enabled and the instructions bound Hunter, Surgeon and Insurance by evidence limits. TrueForge 0.1.x does not expose a policy that guarantees an exact subagent count. Consumers should project `thread.created` events and show what actually ran.

## Current limitations

- Unit tests validate local policy and approval batching without starting TrueForge. A live server, configured model and GitHub MCP access are still required for an end-to-end run.
- `list_commits` supports bounded suspect-range analysis, not a real executable bisect.
- An approved `actions_run_trigger` dispatch does not by itself create a pull request. The target repository must provide a reviewed workflow that creates a draft PR and returns evidence of its URL.
- The bundled standalone SQLite mode is for a local hackathon demo, not production or multi-replica deployment.
- Token scope and repository workflow permissions still apply. Use the least privileged GitHub token that can read evidence and dispatch the intended workflow.

Run offline checks with:

```sh
pnpm --filter @verdict/agent typecheck
pnpm --filter @verdict/agent test
```
