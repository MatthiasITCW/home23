# Home23 Worker Agents

Worker agents are reusable specialists Home23 can call when a job needs focus but does not need another full engine. They have their own workspace, playbook, run history, artifacts, and proof receipts. Jerry, Forrest, or the human operator can run them on demand.

The point is simple: when something needs checking, a worker can do the pass, leave evidence, and feed useful findings back to the house agents.

## What You Can Use Them For

The first worker is `systems`.

Use `systems` when:

- Home23 feels slow or stale.
- A dashboard, endpoint, PM2 process, or live problem needs a grounded check.
- You want evidence before restarting anything.
- You need Jerry or Forrest to remember what was verified.

It can:

- Inspect scoped PM2 process status.
- Probe dashboard and engine endpoints.
- Read relevant service logs.
- Check freshness, health, receipts, and verifier outcomes.

It will not:

- Run global destructive PM2 commands.
- Clean up files or git state on its own.
- Claim a fix without a concrete verifier or equivalent check.

## User Surfaces

- Dashboard: `http://localhost:5002/home23`, then open `Workers` / `Worker Desk`.
- Settings: `http://localhost:5002/home23/settings#workers`, the `Worker Library`.
- Connector API through dashboard: `/home23/api/workers`.
- Owner bridge API: `/api/workers` on the selected agent bridge port, normally `5004` for Jerry.

## Create a Worker

From Settings, open `Workers`, pick a worker pack, choose the owner agent, enter a lowercase kebab-case name, and click `Install Worker`.

CLI equivalent:

```bash
node cli/home23.js worker create systems --template systems --owner jerry
```

The worker is created under:

```text
instances/workers/<name>/
```

Each worker has:

- `worker.yaml` for identity, owner, class, tools, limits, visibility, and brain-feed defaults.
- `workspace/IDENTITY.md` for durable role identity.
- `workspace/PLAYBOOK.md` for the repeatable operating procedure.
- `workspace/artifacts/` for output files.
- `runs/<runId>/` for inputs, transcript, artifacts, and `receipt.json`.

## Run a Worker

From the dashboard `Workers` tab, pick a starter action such as `Check Home23 health`, `Why is it slow?`, `Inspect live problem`, or `Verify a fix`. Add plain-language context if needed, then click `Run Check`.

Good asks:

```text
Check why Home23 feels slow right now.
Inspect the current live problem and tell me the next repair step.
Verify the dashboard and engine endpoints are healthy.
Check whether the health bridge data is fresh enough to trust.
```

CLI equivalent:

```bash
node cli/home23.js worker run systems "inspect the current live problem and produce a receipt"
```

Direct dashboard API:

```bash
curl -s http://127.0.0.1:5002/home23/api/workers/systems/runs \
  -H 'content-type: application/json' \
  -d '{"prompt":"inspect the current live problem and produce a receipt","requestedBy":"human","requester":"jtr"}'
```

## Receipts and Memory

Every run writes a `home23.worker-run.v1` receipt with:

- `status`: `fixed`, `no_change`, `blocked`, `failed`, or `cancelled`.
- `verifierStatus`: `pass`, `fail`, `unknown`, or `not_run`.
- `summary`, evidence, artifacts, and memory candidates.
- source fields when a run came from live problems, Good Life, cron, or a house agent.

House agents observe the worker brain-feed JSONL and inject recent worker receipts into context. The dashboard receipt panel can also send memory candidates to the memory-curator handoff endpoint.

## Built-In Template

`systems` is the first packaged worker. It is meant for system diagnosis, process pressure, health bridge status, PM2 checks, and operational verification. It defaults to Jerry as owner and feeds worker receipts back to Jerry.

## Safety Model

Workers are intended to be small, bounded, and reusable. They should:

- Work inside their own workspace unless the task explicitly requires reading the Home23 repo or host state.
- Produce receipts instead of vague chat summaries.
- Use verifiers before claiming a fix.
- Leave destructive host or git operations to a house agent unless explicitly allowed by their playbook and the operator request.

## Current Limits

- First slice runs are synchronous through the owner bridge connector.
- Cancel is exposed in the API but returns `not_supported` until async queued runs are added.
- Memory promotion currently returns candidates to the curator handoff surface; it does not silently write arbitrary memories.
