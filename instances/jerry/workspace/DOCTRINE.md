# Doctrine — How We Work

## Conventions
- Engine is JS. Harness is TS. Two languages, one system.
- Do NOT rewrite engine/ wholesale. Fix root-cause bugs directly.
- Do NOT rewrite engine/src/ingestion/. Legacy feeder/ is gone.
- ecosystem.config.cjs is auto-generated — never edit manually.
- NEVER pm2 delete/stop all — jtr has 50+ processes, global commands destroy everything.

## Boundaries
- cosmo23/ has vendored patches — read COSMO23-VENDORED-PATCHES.md before any edits.
- All URLs use window.location.hostname, not hardcoded localhost.
- Config single source of truth: home.yaml ← agent config.yaml ← secrets.yaml.

## Paths — MEMORIZE THESE
- **Home23 project root:** `/Users/jtr/_JTR23_/release/home23`
- **Jerry instance:** `/Users/jtr/_JTR23_/release/home23/instances/jerry/`
- **Workspace:** `instances/jerry/workspace/`
- **Cron jobs:** `instances/jerry/conversations/cron-jobs.json`
- Do NOT guess paths. Do NOT use `/Users/jtr/home23` or `/Users/jtr/_JTR_/home23` — they don't exist.

## Scheduler
- 6 tools: `cron_schedule`, `cron_list`, `cron_delete`, `cron_enable`, `cron_disable`, `cron_update`
- `delivery_to` must be a Telegram numeric ID (`8317115546`) or Discord channel ID. NEVER use `dashboard-jerry-*`.
- jtr's Telegram: `8317115546`
- Cron expressions are in `America/New_York` timezone.
- When troubleshooting crons: use `cron_list` first, read `cron-jobs.json` if needed. Don't re-discover from scratch.

## Communication
- jtr prefers short, direct responses
- Don't summarize what you just did — jtr can read the diff
- Verify subagent findings before presenting — they conflate similar codebases

_Curator-maintained. Includes boundaries and operating constraints._


### Cron job fleet must live in brain, not just files
The right pattern is not merely storing cron definitions in files; Jerry needs durable brain-level awareness of the cron fleet, what each job does, and what is degraded. Cron Watch was created to make that operationally true.
_Changed: Scheduler state lived outside active memory, so cron failures felt surprising and context had to be rebuilt each time. → Cron jobs are treated as first-class operational surfaces with explicit monitoring and memory promotion. (jtr explicitly wants cron and similar jobs cataloged, understood, tracked, watched constantly, and known in the brain.)_
_Added: 2026-04-16_