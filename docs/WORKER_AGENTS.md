# Home23 Worker Agents

Worker agents are reusable specialist agents with their own workspace, playbook, run history, artifacts, and receipts. They do not run a standalone Home23 engine. A house agent bridge, such as Jerry's harness connector, runs them on demand and records the result back into the Home23 worker registry.

## User Surfaces

- Dashboard: `http://localhost:5002/home23`, then open `Workers`.
- Settings: `http://localhost:5002/home23/settings#workers`.
- Connector API through dashboard: `/home23/api/workers`.
- Owner bridge API: `/api/workers` on the selected agent bridge port, normally `5004` for Jerry.

## Create a Worker

From Settings, open `Workers`, pick a template, choose the owner agent, enter a lowercase kebab-case name, and click `Create Worker`.

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

From the dashboard `Workers` tab, select a worker, enter a bounded task, and click `Run`. The completed receipt appears in the same tab.

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
