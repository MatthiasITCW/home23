# Home23 Worker Agents Design

Date: 2026-05-02
Status: Draft for jtr review

## Summary

Home23 needs a reusable worker-agent tier: named specialist agents with their own workspace, identity, logs, sessions, and artifacts, but without an engine loop, dashboard, feeder, or autonomous brain. Jerry and Forrest remain the living house agents. Workers are reusable limbs they can call, observe, learn from, and remember through.

This is both a small user-facing tool and a major system primitive. The surface should feel simple:

```bash
node cli/home23.js worker create systems --template systems
node cli/home23.js worker run systems "diagnose this verifier"
```

Under the surface, worker runs must connect to Live Problems, Good Life governance, the engine channel bus, house-agent brain memory, cron automations, and dashboard observability.

## Problem

The existing `home23 agent create <name>` path creates a full Home23 citizen:

- engine PM2 process
- dashboard PM2 process
- harness PM2 process
- workspace
- brain
- feeder config
- ports

That is correct for house agents like Jerry and Forrest, but too heavy for specialist task execution. Running many full engines creates CPU, memory, process, dashboard, and governance overhead. Home23 needs only a few living engines, while most specialized work should be handled by reusable workers.

The current generic diagnostic dispatch also has limits. Live Problems can send work to Jerry through `/api/diagnose`, but every hard problem becomes a generic Jerry turn. Recent Home23 pain shows why typed workers are needed:

- bad rigid remediation loops repeated irrelevant actions such as Docker pruning against unrelated verifiers
- freshness bugs confused fresh wrapper timestamps with stale underlying data
- PM2 and process operations require strict non-destructive rules
- brain persistence and restart flows are high-risk and need dedicated guardrails
- cron drift, dead chat targets, suspect-short jobs, and delivery failures recur
- Jerry and Forrest ownership boundaries need to be explicit at dispatch time
- subagent findings can be wrong unless file paths, evidence, and verifier status are checked

## Goals

- Add reusable named worker agents without creating new engines.
- Give each worker a persistent workspace, identity, session history, artifacts, and logs.
- Let humans, Jerry, Forrest, Live Problems, Good Life, and cron call workers.
- Make worker runs observable to the engine as first-class work events.
- Feed useful worker results into the owning house-agent brain as structured receipts and memory-worthy findings.
- Prevent repeat failed remediations by recording prior attempts and recipes.
- Keep strong safety boundaries around PM2, filesystem, engine restarts, and brain persistence.
- Preserve a small number of full living engines while making specialist capacity broad.

## Non-Goals

- Do not create a new autonomous engine per worker.
- Do not create dashboards per worker.
- Do not give workers independent long-running cognition loops.
- Do not ingest every raw worker token directly into the brain.
- Do not make workers peer house agents. They are specialist action contexts owned by house agents.
- Do not replace Live Problems, Good Life, or the current Jerry/Forrest split.

## Core Model

```text
Engine observes reality
  -> Live Problems / Good Life decide action is needed
    -> Dispatcher chooses worker
      -> Worker acts in isolated workspace
        -> Receipt is written
          -> Engine observes receipt
            -> Brain gets structured memory
              -> Jerry/Forrest see it in context
                -> Future action improves
```

A worker run is complete only when it leaves behind:

- evidence
- verifier result
- receipt
- artifact pointers
- memory-worthy lessons
- owning house-agent routing

## Worker Types

Initial default worker pack:

| Worker | Owner | Purpose |
| --- | --- | --- |
| `systems` | Jerry | PM2, host, process, ports, logs, scoped service diagnostics |
| `scheduler` | Jerry | cron catalog, job drift, delivery targets, suspect-short jobs |
| `freshness` | Jerry/Forrest | semantic freshness for health, pressure, sauna, weather, bridges |
| `brain-guardian` | Jerry | brain persistence, load checks, high-water checks, restart safety |
| `coder` | Jerry | bounded implementation work with file ownership and tests |
| `reviewer` | Jerry | code review, regression risk, missing tests, evidence checks |
| `researcher` | Jerry/Forrest | documentation/web/source research with citations |
| `browser` | Jerry | dashboard/browser flows, screenshots, local UI checks |
| `file-surfer` | Jerry/Forrest | repository, PDF, document, and artifact reading |
| `release` | Jerry | git status, changelog, commit/PR prep, push only when explicitly allowed |
| `memory-curator` | Jerry/Forrest | summarize worker outputs into memory receipts and handoffs |
| `router` | Jerry | classify ambiguous tasks and pick the right worker or house agent |

Later workers can be packaged as templates. Home23 should ship with the first four because they map directly to repeated system pain.

## Filesystem Layout

Workers live outside `instances/<agent>/` so ecosystem generation does not treat them as full engines.

```text
instances/workers/
  systems/
    worker.yaml
    workspace/
      IDENTITY.md
      PLAYBOOK.md
      NOW.md
      MEMORY.md
      sessions/
      artifacts/
    runs/
      <run-id>/
        input.md
        transcript.md
        receipt.json
        artifacts/
    logs/
```

Full-agent discovery continues to scan only `instances/<name>/config.yaml`. Worker discovery scans `instances/workers/<name>/worker.yaml`.

## Worker Config

Example:

```yaml
kind: worker
name: systems
displayName: Systems
ownerAgent: jerry
class: ops
purpose: Diagnose host/process/PM2/system issues without destructive global operations.
provider: xai
model: grok-4.20-non-reasoning-latest
tools:
  shell: true
  files: true
  cron: true
  brain: true
  web: false
safetyPolicy:
  pm2Scope: home23-only
  forbidGlobalPm2: true
  forbidForcePush: true
  requireVerifierBeforeSuccess: true
feedsBrains:
  - jerry
visibleTo:
  - jerry
  - forrest
limits:
  maxRuntimeMinutes: 45
  maxToolCalls: 80
  maxTokens: 120000
```

## Dispatch Surfaces

### CLI

```bash
node cli/home23.js worker create systems --template systems
node cli/home23.js worker list
node cli/home23.js worker run systems "check why this verifier fails"
```

### Chat

House agents should support natural delegation:

```text
use systems to diagnose the host contention signal
use brain-guardian before touching persistence
use reviewer to check this patch
```

### Live Problems

Add a typed remediator:

```json
{
  "type": "dispatch_to_worker",
  "args": {
    "worker": "freshness",
    "budgetHours": 4
  }
}
```

Backward compatibility remains:

- `dispatch_to_agent` keeps working.
- If no worker is named, `router` chooses one or falls back to Jerry.

### Good Life

Good Life should route repair/recover/help work into workers when the lane maps cleanly:

- viability critical -> `systems` or `brain-guardian`
- continuity strained -> `memory-curator` or `scheduler`
- friction strained -> `systems` or `scheduler`
- usefulness watch -> `coder`, `researcher`, or `browser`

Worker results become Good Life evidence when they verify the expected outcome.

### Cron and Automations

Deterministic cron jobs should package work for workers only when needed:

- process-memory-sampler
- freshness-check
- cron-watch-catalog-refresh
- brain-storage-check
- worker-run-digest

Cheap checks run often. LLM workers run only when checks produce an actionable packet.

## Worker Run Receipt

Every worker run writes `receipt.json`:

```json
{
  "schema": "home23.worker-run.v1",
  "runId": "wr_20260502_143000_systems_ab12",
  "worker": "systems",
  "ownerAgent": "jerry",
  "requestedBy": "live-problems",
  "startedAt": "2026-05-02T14:30:00Z",
  "finishedAt": "2026-05-02T14:42:00Z",
  "status": "fixed",
  "verifierStatus": "pass",
  "summary": "Scoped restart cleared dashboard verifier failure.",
  "rootCause": "Dashboard served stale tile state after hidden tile skipped background refresh.",
  "actions": [
    {
      "type": "file_edit",
      "path": "engine/src/dashboard/home23-tiles.js"
    },
    {
      "type": "pm2_restart",
      "target": "home23-jerry-dash"
    }
  ],
  "evidence": [
    {
      "type": "http_jsonpath",
      "detail": "tile.sauna-control.latencyMs <= 200"
    }
  ],
  "artifacts": [
    "instances/workers/systems/runs/wr_20260502_143000_systems_ab12/transcript.md"
  ],
  "memoryCandidates": [
    {
      "type": "procedure",
      "title": "Hidden custom telemetry tiles still need background refresh",
      "appliesTo": ["home23-dashboard", "tile-refresh", "live-problems"]
    }
  ],
  "feedBrains": ["jerry"]
}
```

## Engine Channel

Add `work.worker-runs`, modeled after `work.live-problems`.

The channel polls worker receipts and emits observations for:

- worker run started
- worker run completed
- worker run failed
- verifier passed or failed
- files changed
- recipes recorded
- memory candidates created

These observations crystallize as work events so the engine knows what the workers did.

## Brain Feeding

Worker output feeds brains in layers:

1. Raw transcript remains in the worker run directory.
2. Receipt summary is copied/indexed into the owner house-agent workspace:

   ```text
   instances/jerry/workspace/worker-runs/<run-id>.md
   ```

3. Structured receipt lands in the owner brain:

   ```text
   instances/jerry/brain/worker-runs.jsonl
   ```

4. Memory candidates are reviewed/promoted through the existing memory-object path or a dedicated `memory-curator` worker.
5. Cross-agent summaries are routed by ownership rules.

The brain should receive distilled findings and pointers, not raw transcript flood.

## House-Agent Awareness

Jerry and Forrest pre-turn context should include:

```text
[WORKER ROSTER]
systems: available, last run 20m ago, last outcome fixed
scheduler: available, owns cron drift
freshness: available, owns stale stream checks
brain-guardian: available, use before persistence/restart changes

[RECENT WORKER RUNS]
systems fixed sauna latency verifier at 09:51
systems found runaway forrest pressure-correlate jobs at 08:29
```

This keeps house agents aware of specialist capacity and recent outcomes without requiring them to inspect folders manually.

## Cross-Agent Routing

Workers may feed more than one brain, but routing must preserve ownership:

- Jerry owns house ops, infra, dashboard plumbing, cron, shared telemetry movement, Good Life governance.
- Forrest owns health interpretation, longitudinal health judgment, body metrics, recovery meaning, and health UX.
- Shared zone: pressure x health x sauna correlation and dashboard/API surfaces that join house telemetry with health decisions.

Example:

1. `freshness` detects HealthKit stale.
2. Receipt feeds Jerry because data movement/bridge freshness is Jerry-owned.
3. If health interpretation changes, a routed summary also feeds Forrest.

## Safety Policies

Safety is per-worker, not just prompt text.

`systems` must enforce:

- never `pm2 stop all`
- never `pm2 delete all`
- never `pm2 kill`
- never stop live `cosmo23-*` agents without explicit permission
- restart only scoped process names
- verify before declaring success
- list commands and targets in the receipt

`brain-guardian` must enforce:

- run standalone load checks before persistence-related engine restart
- compare loaded node count to `brain-snapshot.json`
- check high-water count
- verify post-restart logs
- block or escalate if node count drops unexpectedly

`release` must enforce:

- never force push
- never stage unrelated dirty files
- show exact files before commit
- push only when explicitly requested or policy allows

## Dashboard

Add a Workers surface showing:

- roster
- owner agent
- availability
- active runs
- recent outcomes
- verifier status
- files changed
- brain feed status
- blocked/failing workers

This is not a marketing page. It is an operator surface attached to the live OS.

## Implementation Notes

Implementation should be staged:

1. Worker registry and filesystem scaffolding.
2. Worker runner that can execute a named worker from CLI and write receipts.
3. Harness integration so Jerry can call workers.
4. Live Problems `dispatch_to_worker`.
5. Engine `work.worker-runs` channel.
6. Brain/workspace receipt ingestion.
7. Good Life routing.
8. Dashboard Workers surface.
9. Default worker templates.

## Initial Decisions

- Worker runs default to the owner agent's current chat provider/model unless `worker.yaml` overrides it.
- Only receipts are fed into house-agent brains by default. Raw transcripts stay linked as evidence.
- Start with one active worker run per owner agent. Add parallelism only after receipts, locks, and dashboard visibility are stable.
- `router` starts as deterministic classification plus a worker fallback for ambiguous cases. Deterministic routing handles clear categories; the `router` worker handles unclear ownership or mixed-domain tasks.

## References

- Claude Code subagents: https://docs.claude.com/en/docs/claude-code/subagents
- OpenAI Agents SDK handoffs: https://openai.github.io/openai-agents-python/handoffs/
- OpenAI multi-agent patterns: https://openai.github.io/openai-agents-python/multi_agent/
- Microsoft Magentic-One: https://www.microsoft.com/en-us/research/articles/magentic-one-a-generalist-multi-agent-system-for-solving-complex-tasks/
- CrewAI introduction: https://docs.crewai.com/en/introduction
