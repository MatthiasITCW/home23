# House Topology

## Services & Ports (jerry)
- 5001: Engine WebSocket (home23-jerry)
- 5002: Dashboard HTTP (home23-jerry-dash)
- 5003: MCP Server (home23-jerry embedded)
- 5004: Evobrew Bridge (home23-jerry-harness)
- 3415: Evobrew IDE (home23-evobrew shared)
- 43210: COSMO 2.3 Research (home23-cosmo23 shared)
- 8090: Home23 Dashboard (home23-dashboard, Node.js/Express, replaced Python docs on 2026-04-14)

## Publication Surfaces
- Home23 Dashboard: http://100.72.171.58:8090 (live data: Home tiles, Docs, Sauna, Pressure, Health, Weather)
- Dashboard (AI OS home): http://localhost:5002/home23
- Evobrew IDE: http://localhost:3415

## Project Root (absolute paths)
- Home23: `/Users/jtr/_JTR23_/release/home23`
- jtr home: `/Users/jtr`
All relative paths under project root.

## Runtime Directories (under project root)
- Instance: `instances/jerry/`
- Workspace: `instances/jerry/workspace/`
- Brain: `instances/jerry/brain/`
- Conversations: `instances/jerry/conversations/`
- Cron jobs: `instances/jerry/conversations/cron-jobs.json`
- Cron run logs: `instances/jerry/conversations/cron-runs/`

## Scheduler (Cron System)
6 tools: cron_schedule, list, delete, enable, disable, update. Jobs file persists across restarts. Delivery targets must be durable IDs (Telegram numeric, Discord channel). jtr's Telegram DM: `8317115546`. Discord guild: `1480393008791818474`. Exec jobs run from project root by default; cwd field overrides. Timezone: `America/New_York`.

## iOS App (Home23)
- Xcode: `/Users/jtr/xCode_Builds/Home23/`
- Bundle: `com.regina6.home23`
- Connects via Tailscale to bridge port 5004
- APNs key: `~/secrets/AuthKey_W2N4N6UGYS.p8`

## Recent Changes & Non-obvious Facts
- Port 8090 now runs Home23 Dashboard (Node.js/Express, pm2: home23-dashboard). Replaced Python docs HTTP server on 2026-04-14.
- Brain service at localhost:5002 does **not** expose `/health`. Verify correct health endpoint for monitoring.
- Agent operates with reduced context awareness if brain is unavailable; core functions (tools, research, shell, web) still work.
- OpenAI is the only hard embedding requirement for core system. Ollama optional except home23 requires Ollama embedding.
- _Last verified: 2026-04-14. Source: config.yaml + PM2._

### ET timezone convention
All cron schedules use ET (Eastern Time), not UTC
_Changed: (unknown prior state) → Confirmed ET is the standard timezone for all scheduling (Consistency across pipeline documentation and cron definitions)_
_Added: 2026-04-28_