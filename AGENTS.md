# Home23 — Agent Instructions

## What This Is

Home23 is a running AI operating system. The repo at `/Users/jtr/_JTR23_/release/home23/` is both the public GitHub repo AND jtr's live running system. Agent "jerry" runs from here via PM2.

**GitHub:** https://github.com/notforyou23/home23

## Before You Do Anything

1. Read the handoff docs in this repo:
   - `docs/handoff/session_2026-04-09b_handoff.md` — LATEST: what was built, current state, priority work
   - `docs/handoff/session_2026-04-09_full_context.md` — complete build narrative (all bugs, fixes, design decisions)
   - `docs/handoff/session_2026-04-09_handoff.md` — Steps 12-13 context
   - `docs/handoff/session_2026-04-08_handoff.md` — Steps 8-11 context

2. Also read memory files (if available) at `/Users/jtr/.claude/projects/-Users-jtr--JTR23--release-home23/memory/`:
   - `next_session_instructions.md` — startup checklist
   - `user_jtr.md` — who you're working with

2. Verify the system is running:
```bash
pm2 jlist | python3 -c "import sys,json; [print(f\"{p['name']:30s} {p['pm2_env']['status']}\") for p in json.load(sys.stdin) if 'home23' in p['name']]"
curl -s http://localhost:5002/api/state | python3 -c "import sys,json; d=json.load(sys.stdin); m=d.get('memory',{}); print(f'cycle={d.get(\"cycleCount\",0)} nodes={len(m.get(\"nodes\",[]))}')"
```

## Priority Work

### 1. Agent ↔ COSMO 2.3 Full Toolkit (NEXT SESSION)

COSMO 2.3 integration is live and verified end-to-end (2026-04-10 smoke test: 5 cycles, 26 nodes, 84 edges, real findings, clean shutdown, compile-to-brain working). But jerry's `research` tool only exposes 4 coarse actions covering a sliver of COSMO's ~15 HTTP endpoints — and `launch` doesn't even forward `context`, forcing COSMO's guided planner to invent its framing from model priors.

**Goal:** Expand jerry into a real COSMO collaborator. Each action should map cleanly to one COSMO endpoint with a focused schema.

**Target action set:**

| Action | Endpoint | Purpose |
|---|---|---|
| `search_brains` | `GET /api/brains` + `POST /api/brain/:name/query` | list + query top N |
| `launch` | `POST /api/launch` | full params: topic, **context**, depth, cycles, maxConcurrent, models |
| `continue` | `POST /api/continue/:brainId` | resume a completed brain with overrides |
| `watch` | `GET /api/watch/logs?after=<cursor>` | cursor-based log streaming during a run |
| `stop` | `POST /api/stop` | clean kill |
| `get_brain_summary` | `GET /api/brain/:name/intelligence/{executive,goals,trajectory}` | high-level overview |
| `get_brain_graph` | `GET /api/brain/:name/graph` | nodes/edges |
| `query_brain` | `POST /api/brain/:name/query` (modes: quick/full/expert/dive) | PGS/synthesis query |
| `compile_brain` | query + workspace write | whole-brain compile (current behavior) |
| `compile_section` | targeted `intelligence/*` + workspace write | compile one goal/insight/agent output |

**Steps:**
1. Write `docs/design/STEP16-AGENT-COSMO-TOOLKIT-DESIGN.md` — schemas, endpoint map, when-to-use guidance, situational awareness injection
2. Implement in `src/agent/tools/research.ts` (or split into `src/agent/tools/research/*.ts` if it gets big)
3. Smoke test each action individually, then a composite: jerry (via dashboard chat) launches with proper context, watches it, queries mid-flight, compiles sections

**Key references:**
- `docs/design/COSMO23-VENDORED-PATCHES.md` — CRITICAL: patches to vendored `cosmo23/` source, must survive `cli/home23.js cosmo23 update`
- `cosmo23/server/CLAUDE.md` — authoritative route map for cosmo23 server API
- `cosmo23/server/lib/brains-router.js` — brain listing + continuation endpoints
- `src/agent/tools/research.ts` — current 4-action tool

### 2. Done: COSMO 2.3 Integration (2026-04-10 FIXED + VERIFIED)

Config unification patches, env-first key resolution, engine heap bump from 768MB→4GB, dashboard Tailscale timeouts, ENGINE indicator. Smoke test: 5-cycle gpt-5.2 run completed clean with 26 brain nodes and 84 edges. Compile path verified end-to-end. See `docs/design/COSMO23-VENDORED-PATCHES.md` for vendored patches that MUST be re-verified on any cosmo23 update.

### 3. Done: Engine Sleep/Wake (FIXED)

Sleep/wake rebalanced for Home23. Config-driven, ~90s naps, fast maintenance always runs.
See `docs/design/SLEEP-WAKE-DESIGN.md`.

### 4. Done: Live Activity Indicator (FIXED)

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
- 5 PM2 processes: home23-jerry, home23-jerry-dash, home23-jerry-harness, home23-evobrew, home23-cosmo23
- Standalone feeder (home23-jerry-feeder) is STOPPED — engine's built-in DocumentFeeder handles ingestion
- Dashboard: http://localhost:5002/home23
- Evobrew: http://localhost:3415 (managed by Home23, config.json gitignored + auto-generated)
- COSMO 2.3: http://localhost:43210
- Engine: cognitive loops with config-driven sleep/wake (~90s naps), pulse bar on dashboard
- Ingestion: engine DocumentFeeder processing ~4400 files through LLM compiler (minimax-m2.7)
- Jerry's model: configurable via dashboard dropdown (currently grok-4.20-reasoning-latest / xai)
- Model change flow: dashboard dropdown → config.yaml → harness auto-restart → evobrew config regen
- Config single source of truth: `config/home.yaml` + `config/secrets.yaml` + `instances/jerry/config.yaml`
- Design: ReginaCosmo glass-morphism (space gradient, particles, translucent tiles)
