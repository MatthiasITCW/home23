# House Topology

## Ports & Services (jerry)
- 5001: Engine WebSocket (home23-jerry)
- 5002: Dashboard HTTP/API (home23-jerry-dash) - /home23, /api/live-problems, /api/good-life
- 5003: MCP Server (home23-jerry embedded)
- 5004: Evobrew Bridge (home23-jerry-harness)
- 3415: Evobrew IDE (home23-evobrew shared)
- 43210: COSMO 2.3 Research (home23-cosmo23 shared)
- 8090: Home23 Dashboard (Node.js/Express, pm2: home23-dashboard) replaced Python docs 2026-04-14

## URLs
- Dashboard (live): http://100.72.171.58:8090
- Dashboard (AI OS home): http://localhost:5002/home23
- Evobrew IDE: http://localhost:3415

## Project Root
Home23: `/Users/jtr/_JTR23_/release/home23`
All relative paths under this.

## Runtime Dirs (under project root)
- Instance: `instances/jerry/` (workspace, brain, conversations)
- Cron jobs: `instances/jerry/conversations/cron-jobs.json`
- Cron run logs: `instances/jerry/conversations/cron-runs/`

## Scheduler (Cron)
6 tools: schedule, list, delete, enable, disable, update. Jobs persist across restarts. Delivery targets use durable IDs (Telegram numeric, Discord channel). jtr Telegram DM: `8317115546`. Discord guild: `1480393008791818474`. Exec jobs run from project root; cwd field overrides. Timezone: America/New_York (ET) – all schedules in ET. (Confirmed 2026-04-28)

## iOS App (Home23)
- Xcode: `/Users/jtr/xCode_Builds/Home23/`
- Bundle: `com.regina6.home23`
- Connects via Tailscale to bridge port 5004
- APNs key: `~/secrets/AuthKey_W2N4N6UGYS.p8`

## Recent & Non-obvious
- Good Life governance live 2026-05-01. Runtime files under `engine/src/good-life/`. Brain files: `instances/jerry/brain/` with state, ledger, commitments, trends. Telemetry is engine governance evidence (not personal diagnosis).
- Port 8090 Dashboard replaced Python docs on 2026-04-14.
- Brain at localhost:5002 does **not** expose `/health`. Verify correct health endpoint for monitoring.
- If brain unavailable, agent operates with reduced context; core functions (tools, research, shell, web) still work.
- OpenAI is hard embedding requirement for core. Ollama optional except home23 requires Ollama embedding.
- Duplicate same role for same agent or PM2/script mismatch is suspicious.