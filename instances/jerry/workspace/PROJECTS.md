# Active Projects

## In Flight

### Home23 Dashboard — SHIPPED
- **What it does:** Live data dashboard at port 8090, accessible over Tailscale. Sections: Docs, Live Data (Sauna, Pressure, Health, Weather)
- **Location:** `instances/jerry/projects/Dashboard/`
- **Stack:** Node.js + Express, vanilla JS, ES modules, pm2-managed
- **Data sources:** `~/.sauna_usage_log.jsonl`, `~/.pressure_log.jsonl`, `~/.health_log.jsonl`, `engine/data/sensor-cache.json`, Pi API
- **Key routes:** `/` (home), `/docs/:file`, `/data/:stream`, `/api/:stream`
- **pm2 name:** `home23-dashboard`
- **To update:** edit `server.js`, then `pm2 restart home23-dashboard`
- **Known to jerry:** new sections added to sidebar + route handlers in server.js
- **Shipped:** 2026-04-14

### Situational Awareness Engine (Step 20) — SHIPPED
- **Status:** All 6 phases built and live
- **What it does:** Brain-driven pre-turn context assembly — 10 brain cues + 5 domain surfaces loaded before every LLM call
- **Key components:** Assembly layer, MemoryObject model with state_deltas, ProblemThreads, event ledger, trigger index, curator cycle, promote_to_memory tool
- **Verified:** Agent answers "what port is published docs on?" immediately from context — no tool calls needed
- **Thread:** tactical — child of "Ship Home23 as a product"

### Telegram Message Handling (Step 19) — SHIPPED
- Adaptive debounce (1.5s-6s based on message content)
- Queue-during-run (buffer messages while agent processes)
- Shipped 2026-04-12

### Scheduler / Cron System — ACTIVE
- **What it does:** Runs recurring and one-shot tasks: ticker crons, brain housekeeping, health/pressure bridges, x-timeline research, field reports
- **Location:** `src/scheduler/cron.ts` (engine), `src/agent/tools/cron.ts` (6 tools), `src/scheduler/delivery.ts` (delivery)
- **Jobs file:** `instances/jerry/conversations/cron-jobs.json` — 15+ active jobs
- **Key jobs:** ticker-home23-pre-market (5:30am ET), ticker-home23-mid-session (11:30am), ticker-home23-evening-research (8pm), brain-housekeeping (hourly), pi-pressure-bridge (5min), pi-health-bridge (15min), x-timeline-morning/evening, field-report-cycle (2h)
- **Tools:** `cron_schedule` (create), `cron_list` (view), `cron_delete`, `cron_enable`, `cron_disable`, `cron_update` (edit in-place)
- **Delivery:** Results go to Telegram `8317115546` or Discord `1480393008791818474`. delivery_to must be a numeric chat ID — NEVER `dashboard-jerry-*`
- **Bugs fixed 2026-04-16:** timezone-aware cron matching, delivery failure surfacing, input validation, new enable/disable/update tools, corrupt job cleanup

### Home23 iOS App — SHIPPED 2026-04-15
- **What it does:** Native iOS app — chat with agents, sauna controls, pulse/vibe/dreams/sensors/goals on Home tab, push notifications
- **Location:** `/Users/jtr/xCode_Builds/Home23/`
- **Backend additions:** Turn protocol (POST /api/chat/turn + SSE stream), APNs pusher, device registry, per-turn model override, TTS via MiniMax Speech 2.8

## Recent Completions

- Step 16: COSMO research toolkit (11 research_* tools)
- Step 15: Design language overhaul (ReginaCosmo)
- Step 14: Vibe tile + CHAOS MODE image flow

## Brain Insights (curator-promoted)

### Brain contains substantial knowledge structure
The persistent AI agent's brain contains 21,048+ nodes, 44,649+ edges, and 1,468+ cognitive cycles — a rich, non-trivial knowledge structure.
_Changed: Unknown/assumed thin → Brain is rich with interconnected knowledge_
_Added: 2026-04-12_

### Brain contains self-aware analysis of current problem
The brain identified and tagged the exact contextual amnesia problem before it manifested as a failure.
_Changed: Problem appeared novel → Problem was previously analyzed by the system itself_
_Added: 2026-04-12_

_Curator-maintained. Last updated: 2026-04-12._


### Port 5002 hosts research lab UI not brain
Port 5002 is running the COSMO Research Lab UI (research engine), not the brain engine. The brain tool points to a different endpoint that is currently unreachable.
_Changed: Assumed port 5002 was brain engine endpoint → Port 5002 is research engine; brain engine is on separate unreachable endpoint (Clarification during troubleshooting revealed correct topology)_
_Added: 2026-04-12_

### Research tools remain operational despite brain outage
The research engine and tools are still functional; only brain search/query and long-term memory retrieval are impacted by the brain engine being down.
_Changed: Full system impact unknown → Only brain/memory component down; research tools unaffected (Verified during troubleshooting that research engine responds independently)_
_Added: 2026-04-12_

### Degraded continuity mode operational
Agent can operate with reduced continuity - tools, research, shell, and web functionality remain available despite brain unavailability. Only long-term memory retrieval and prior conversation history access are impaired.
_Changed: Unknown capability profile under brain outage → Most operational capabilities persist; only context-dependent on prior memory is affected (Confirms system resilience and helps set realistic expectations for current session)_
_Added: 2026-04-12_