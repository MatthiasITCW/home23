# Home23 — Agent Instructions

## What This Is

Home23 is a running AI operating system. The repo at `/Users/jtr/_JTR23_/release/home23/` is both the public GitHub repo AND jtr's live running system. Agent "jerry" runs from here via PM2.

**GitHub:** https://github.com/notforyou23/home23

## Before You Do Anything

1. Read memory files (if available) at `/Users/jtr/.claude/projects/-Users-jtr--JTR23--release-home23/memory/`:
   - `MEMORY.md` — index of all memory files (start here)
   - Most recent `session_*_handoff.md` — latest session context, what was built, any open issues
   - `user_jtr.md` — who you're working with

2. Read the design docs for whatever area you're touching:
   - `docs/design/STEP16-AGENT-COSMO-TOOLKIT-DESIGN.md` — if working on research tools
   - `docs/design/STEP17-FEEDER-SETTINGS-DESIGN.md` — if working on ingestion or the Feeder tab
   - `docs/design/COSMO23-VENDORED-PATCHES.md` — **CRITICAL: read before touching anything in `cosmo23/`**

3. Verify the system is running:
```bash
pm2 jlist | python3 -c "import sys,json; [print(f\"{p['name']:30s} {p['pm2_env']['status']}\") for p in json.load(sys.stdin) if 'home23' in p['name']]"
curl -s http://localhost:5002/api/state | python3 -c "import sys,json; d=json.load(sys.stdin); m=d.get('memory',{}); print(f'cycle={d.get(\"cycleCount\",0)} nodes={len(m.get(\"nodes\",[]))}')"
curl -s http://localhost:43210/api/status | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'cosmo23 running={d.get(\"running\")}')"
```

## Priority Work

Good Life autonomy is the current first-class direction for the Home23 engine loop. Treat it as live engine governance, not research theater and not COSMO23 work.

Immediate operational truth as of 2026-05-01:
- The staleness architecture problem is now an active engine concern: memory retrieval must distinguish "what was believed then" from "what is true now." State snapshots and goal resolution receipts are first-class memory objects.
- Health bridge wrapper writes can be fresh while HealthKit metric dates are stale. Do not trust `~/.health_log.jsonl` mtime alone.
- The Pi health endpoint `http://jtrpi.local:8765/api/health/dashboard` was unreachable from the Mac at 2026-05-01 15:06 EDT (`No route to host`), and the newest HRV metric date in the Mac log was `2026-04-21`.
- The next real repair is upstream health/Pi reachability or HealthKit export freshness, not another correlation UI.
- Remaining Good Life operational issue: diagnose the host CPU/contention signal that may explain catalog-refresh / heartbeat / Pi-health regressions.

### Recent completions (most recent first)

#### Done: Temporal State Snapshots + Retrieval Recency (2026-05-01)

Home23 had a staleness architecture failure: cue-matched memory could surface old conclusions as if they were current because retrieval ranked relevance without durable temporal status. Fixed the engine so current-state anchors and resolution receipts participate directly in memory.

- `engine/src/core/orchestrator.js` — writes `RECENT.md` into memory as a `state_snapshot` node with `asserted_at`, `asserted_cycle`, source path, and content hash when the surface changes.
- `engine/src/memory/network-memory.js` — nodes now preserve temporal metadata; semantic retrieval applies recency/status weighting and boosts relevant `state_snapshot` nodes above older cue matches.
- `engine/src/agents/mcp-bridge.js` — MCP `query_memory` hydrates sidecar memory before searching and returns temporal fields; keyword retrieval also boosts matching state snapshots.
- `engine/src/goals/goal-curator.js` — goal completion/archive events write `goal_resolution` memory receipts linked to the resolved goal, so completed work can suppress rediscovery loops.
- `tests/engine/memory/network-memory-temporal.test.js` — proves a current state snapshot beats an older Health bridge node and verifies temporal metadata survives `exportGraph`.

#### Done: Health Bridge Semantic Freshness + Tick Scheduler Repair (2026-05-01)

The brain correctly identified that the pressure/health/correlation stack could look alive while operating on stale health data. Fixed Home23 so freshness means semantic metric freshness, not just log file mtime.

- `scripts/log-health.sh` — now writes `~/.health_log.status.json`, rejects stale HealthKit payloads, and stops appending fresh wrapper timestamps around old health metrics.
- `engine/src/live-problems/verifiers.js` — added `jsonl_metric_date_fresh` verifier for nested metric dates such as `metrics.heartRateVariability.date`.
- `engine/src/live-problems/seed.js` — `health_log_fresh` now checks both file mtime and HRV metric date freshness.
- `engine/src/channels/domain/health-channel.js` — stale health payloads become `UNCERTIFIED` with lower confidence instead of `COLLECTED`.
- `scripts/analyzers/correlate-pressure-hrv.js` — correlation artifacts now label stale HRV data as historical-only and forbid operational interpretation until the health bridge is fresh.
- Verified current state: pressure log is current, health endpoint is unreachable from the Mac, latest HRV metric date is `2026-04-21`, correlation artifact generated with stale warning.
- Also fixed old `tick-orb-bot` live scheduler defects in `/Users/jtr/_JTR23_/cosmo-home_2.3/projects/tick-orb-bot/`: restored `etTimeHM` export and recreated missing `heartbeat.sh`, `dead-day-check.sh`, and `close-truth-check.sh`. Manual intraday review and all three guard scripts pass.

#### Done: Good Life Governance Surfaces + Routing Fix (2026-05-01)

Good Life is now operational inside the Home23 engine loop. The PDF proposal at `/Users/jtr/_JTR23_/cosmo-home_2.3/engine/Proposal_ A Self-Reflective “Good Life” Objective for COSMO.pdf` was digested as doctrine, but implementation belongs here in Home23, not COSMO23.

- `engine/src/good-life/objective.js` — lane model: viability, continuity, usefulness, development, coherence, friction, recovery; policy modes repair/recover/help/learn/play/rest/ask/observe; bounded action card.
- `engine/src/good-life/regulator.js` — routes Good Life repair/recover/help policies into agenda + MotorCortex as first-class autonomy input; enforces usefulness contract and self-maintenance budget.
- `engine/src/good-life/commitments.js`, `trends.js`, `sleep-policy.js` — durable commitments, per-lane trends with no scalar reward, and sleep/wake regulation.
- `engine/src/channels/domain/good-life-channel.js` + `config/home.yaml` — Good Life channel emits `domain.good-life`.
- Dashboard: `GET /api/good-life` plus Good Life tile showing policy, lanes, evidence, last action, and why this mode.
- Agent doctrine: `instances/jerry/workspace/GOOD_LIFE.md`, `cli/templates/GOOD_LIFE.md`, and `cli/lib/agent-create.js` seed future agents with the principle set.
- Fix shipped after bad Brain Log behavior: Good Life telemetry no longer flows into generic deep-thought/personal diagnosis. `discovery-engine.js`, `deep-dive.js`, `orchestrator.js`, and `snapshot.js` now keep Good Life governance receipts separate from live-problem diagnostics and forbid personal/life/psychology inference from engine telemetry.
- Verified: focused Good Life/cognition tests pass, `home23-jerry` and `home23-jerry-dash` restarted only by name, `/api/good-life` live.

Current live Good Life state at 2026-05-01 14:25 EDT:
- policy: `repair`
- lanes: viability critical, continuity strained, usefulness watch, development healthy, coherence healthy, friction strained, recovery watch
- evidence: ~44.3k nodes / 63.2k edges, 1 open live problem, 16 open goals, 111 pending agenda items, maintenance ratio ~40%
- remaining open live problem: `agenda_ag-mon1jjgl-4467ce` — identify what process/job started roughly 14h before the CPU signal and whether regressions are host contention symptoms.

#### Done: Crash-Recovery Latch + May 1 Diagnostics (2026-05-01)

Good Life initially entered recovery/repair because crash recovery was latched after successful checkpoint recovery and because Good Life itself was creating self-referential diagnostic live problems. The root causes were fixed, recipes recorded, and self-generated Good Life diagnostics resolved.

- CrashRecoveryManager now clears `crashDetected` on `RECOVERY_SUCCESS`.
- Catalog-refresh regression was diagnosed as likely transient host resource pressure; `monitor.py` now writes local performance context so future spikes have evidence.
- Memory-friction correlation script and cron were added to turn vague “watch memory pressure” into repeatable evidence.
- Good Life self-diagnostic loop was stopped; remaining critical viability is now only the real host CPU/contention agenda.

#### Done: Evobrew Brain Picker Expansion (2026-04-14)

Home23-managed Evobrew was only exposing 2 brain roots because generated `evobrew/config.json` replaced the broader standalone Evobrew brain directories. Fixed by merging external brain roots from `~/.evobrew/config.json` and compatible config sources back into the Home23-generated config, then expanding the picker UI with readable location labels plus an `All brains` view.

- `cli/lib/evobrew-config.js` — merge standalone/external brain roots into generated Home23 config
- `evobrew/server/server.js` — expose better root labels/display names in `/api/brains/locations` and `/api/brains/list`
- `evobrew/public/index.html` — `All brains` view + clearer location chips/meta in picker
- Verified live after `pm2 restart home23-evobrew`: 10 locations, 328 brains visible, including `Cosmo_MenloPark`, `cosmos.evobrew.com`, `bertha`, and `cosmo_2.3`
- Commit: `4f017a2` (`fix: expand evobrew brain picker roots`)

#### Done: Step 17 — Feeder Settings Tab (2026-04-10)

Full configuration surface for the document feeder in the dashboard Settings UI: live status, watch paths, exclusion patterns, chunking, compiler model, converter, drag-and-drop drop zone. Backend split: engine-side admin HTTP on port 5001 (via RealtimeServer), dashboard-side upload via multer + proxies for commands. Hot-apply vs restart-required classification in the save response drives a UI banner.

- `src/ingestion/document-feeder.js` — added `removeWatchPath`, `forceFlush`, `excludePatterns` plumbing
- `src/realtime/websocket-server.js` — `/admin/feeder/*` routes, `setOrchestrator` wiring
- `src/dashboard/server.js` — multer upload + proxy handlers
- `src/dashboard/home23-settings-api.js` — `GET/PUT /api/settings/feeder` with hot/restart split
- `src/dashboard/home23-settings.{html,js,css}` — new Feeder tab with 5 sections + drop zone
- `docs/design/STEP17-FEEDER-SETTINGS-DESIGN.md`

Verified end-to-end: file upload → chokidar → compiler → brain node creation, config changes correctly classified, UI renders with live data.

**Known pre-existing issue** (not Step 17's bug, but affects the Feeder tab): js-yaml strips comments when the settings API writes `configs/base-engine.yaml`. This affects every settings tab, not just Feeder. Fix is a migration to a comment-preserving yaml library — flagged as a follow-up.

#### Done: Step 16 — Agent COSMO Toolkit (2026-04-10)

Replaced the 4-action `research` tool with 11 atomic `research_*` tools + a `COSMO_RESEARCH.md` skill file (loaded via identity layer) + a live `[COSMO ACTIVE RUN]` injection in the agent loop. Jerry can now launch with full context, watch, query, compile sections, and get brain graphs directly from chat. All verified end-to-end including a real 5-cycle gpt-5.2 run that produced 26 nodes and a compiled post-it-note summary.

- `src/agent/tools/research.ts` — 11 tools + `checkCosmoActiveRun()` helper
- `src/agent/tools/index.ts` — 11 registrations
- `src/agent/loop.ts` — active-run awareness injection (~line 385)
- `src/agent/context.ts` — `COSMO_RESEARCH.md` size cap
- `instances/<agent>/workspace/COSMO_RESEARCH.md` — skill file (seeded by agent-create)
- `cli/templates/COSMO_RESEARCH.md` — ships with repo
- `cli/lib/agent-create.js` — new agents get the skill file + identityFiles entry
- `docs/design/STEP16-AGENT-COSMO-TOOLKIT-DESIGN.md`

#### Done: COSMO 2.3 Integration (2026-04-10)

Config unification patches, env-first key resolution, engine heap bump from 768MB→4GB, dashboard Tailscale timeouts, ENGINE indicator. Smoke test: 5-cycle gpt-5.2 run completed clean with 26 brain nodes and 84 edges. Compile path verified end-to-end. See `docs/design/COSMO23-VENDORED-PATCHES.md` for vendored patches that MUST be re-verified on any cosmo23 update.

#### Done: Engine Sleep/Wake

Sleep/wake rebalanced for Home23. Config-driven, ~90s naps, fast maintenance always runs. See `docs/design/SLEEP-WAKE-DESIGN.md`.

#### Done: Live Activity Indicator

Engine pulse bar on dashboard via WebSocket (port 5001). Shows state, phase, energy, cycle, ago timer.

## Hard Rules

- **NEVER** `pm2 stop all` or `pm2 delete all` — jtr has 50+ other processes
- **NEVER** modify `/Users/jtr/_JTR23_/Home23/` — that's the archived old repo
- Engine modifications for root-cause fixes are OK — wholesale rewrites are not
- Don't add features without asking jtr first
- After making changes, restart only the specific process: `pm2 restart home23-jerry` (engine), `pm2 restart home23-jerry-dash` (dashboard)
- Commit and push when work is verified: `cd /Users/jtr/_JTR23_/release/home23 && git add -A && git commit -m "..." && git push`

## The User

jtr is the architect. He doesn't write code — he works through AI agents. He's direct, catches drift fast, and thinks in terms of product not engineering. When something's wrong he'll tell you immediately. Don't over-engineer. Don't add things he didn't ask for. Make it work for users, not just developers.

## System State

- Agent "jerry" running from `/Users/jtr/_JTR23_/release/home23/`
- Core jerry PM2 processes: `home23-jerry`, `home23-jerry-dash`, `home23-jerry-harness`, `home23-evobrew`, `home23-cosmo23`
- Additional Home23-family processes currently include `home23-dashboard`, `home23-forrest`, `home23-forrest-dash`, `home23-forrest-harness`, `home23-screenlogic`, and `home23-chrome-cdp`
- Standalone feeder (`home23-jerry-feeder`) is STOPPED and removed from ecosystem — the engine's built-in DocumentFeeder handles all ingestion from inside `home23-jerry`
- Dashboard: http://localhost:5002/home23
- Good Life operator API: http://localhost:5002/api/good-life
- Settings (incl. Feeder tab): http://localhost:5002/home23/settings
- Evobrew: http://localhost:3415 (managed by Home23, config.json gitignored + auto-generated)
- Evobrew brain picker inherits standalone/external roots in addition to Home23 roots; verified live at 10 locations / 328 brains on 2026-04-14
- COSMO 2.3: http://localhost:43210
- Engine: thinking-machine cognition, Good Life regulator, cognitive loops with config-driven sleep/wake (~90s naps), pulse bar on dashboard
- Ingestion: engine DocumentFeeder processing thousands of files through LLM compiler (minimax-m2.7 default, configurable in Feeder tab)
- Jerry has 30 tools including the 11 `research_*` tools for COSMO 2.3
- Jerry's model: configurable via dashboard dropdown (currently grok-4.20-non-reasoning-latest / xai)
- Model change flow: dashboard dropdown → config.yaml → harness auto-restart → evobrew config regen
- Config single source of truth: `config/home.yaml` + `config/secrets.yaml` + `instances/jerry/config.yaml` + `configs/base-engine.yaml` (feeder block)
- Engine heap: `--max-old-space-size=4096`, `max_memory_restart: 5G` (raised from 768M / 900M to prevent OOM flap with growing brains)
- Design: ReginaCosmo glass-morphism (space gradient, particles, translucent tiles)
