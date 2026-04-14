# Changelog

## 0.3.1 (2026-04-13)

### MiniMax-M2.7 integration pass
- Streaming: harness now uses `messages.stream()` instead of `messages.create()`.
  Text and interleaved thinking deltas arrive in the dashboard chat as MiniMax
  generates them — TTFT drops from 5–15s to ~500ms. Tool loop semantics
  preserved via `stream.finalMessage()`.
- Dashboard chat accumulates thinking deltas into a single rendered block
  instead of spawning one `<div>` per delta event
- Cache hit-rate improved by raising engine-side threshold from 1024 → 4096
  chars. Engine has many small per-call prompts that would write without ever
  being re-read — writes cost 1.25× base, so net-negative without hits. The
  harness identity prefix (~11k tokens) still caches aggressively.
- `AgentEvent` type extended with `cache` variant — dashboard surfaces token
  read/write economics per turn.

## 0.3.0 (2026-04-13)

### Cognitive Evidence Schema (Step 23)
- New `engine/src/core/evidence-receipt.js` — cryptographic run_id/prev_id chain
- Five stage receipts per cycle: ingest, reflect, memory_write, behavior_use, audit
- Canonical nonzero fixture guarantees at least one inspectable artifact per cycle
- Side-by-side audit compares control metadata vs workspace vs registry to catch divergence
- Full-loop enforcer in orchestrator `finally` block fills any missing stages with
  `no_change_detected` fallback — guarantees closure even when cycles error or early-return
- Self-diagnosis block injected into curator/analyst prompts and logged visibly as
  `COMPLETE — durable learning proven` / `INCOMPLETE`
- Receipts persisted to `instances/<agent>/brain/evidence-receipts.jsonl`

### Feeder Hardening
- Concurrency-limited compile queue (default 3 parallel) eliminates 429 rate-limit
  avalanches on bulk folder ingestion
- Compiler supports dual SDK — Anthropic messages API for minimax/anthropic providers,
  OpenAI chat completions for everyone else
- Reasoning-model content-block handling (MiniMax-M2.7 returns `thinking` + `text` blocks,
  compiler now extracts the `text` block correctly)
- Fixed `home.yaml` path resolution for provider lookup
- `updateModel()` on the running compiler — hot-apply from Settings UI actually takes effect

### Settings UI
- Compiler Model and Vision Model are now select dropdowns populated from all provider
  `defaultModels` (previously free-text inputs with no guidance)
- Hot-apply endpoint calls `compiler.updateModel()` so dashboard changes update the
  running instance without a restart

## 0.2.0 (2026-04-13)

### Provider Authority
- Home23 is the single authority for all provider configuration
- Guided onboarding wizard for first-run (Providers -> Agent Create -> Launch)
- COSMO 2.3 and evobrew show "Managed by Home23" UI when running under Home23
- Single encryption key flows from secrets.yaml to all subsystems
- OAuth wiring fixed — ENCRYPTION_KEY and DATABASE_URL reach cosmo23 via PM2

### Update System
- `home23 update` — one command updates everything (code, deps, build, migrate, restart)
- Semantic versioning with tagged releases
- Self-healing `ensureSystemHealth()` runs on every start
- Migration system for breaking changes between versions
- Dashboard shows notification when updates are available
- `evobrew update` and `cosmo23 update` deprecated — bundled systems update with core

### Infrastructure
- COSMO 2.3 health watchdog in dashboard — auto-restarts if process dies
- Dashboard COSMO tab shows actionable offline state with restart button

## 0.1.0 (2026-04-07)
- Initial release — cognitive engine, agent harness, dashboard, evobrew, cosmo23
- Telegram channel integration
- Document ingestion with LLM-powered compiler
- Intelligence synthesis agent
- Brain map visualization
- Agent research toolkit (11 COSMO tools)
- Situational awareness engine
