# House Topology

## Services & Ports (jerry)

| Port | Service | Process |
|------|---------|---------|
| 5001 | Engine WebSocket | home23-jerry |
| 5002 | Dashboard HTTP | home23-jerry-dash |
| 5003 | MCP Server | home23-jerry (embedded) |
| 5004 | Evobrew Bridge | home23-jerry-harness |
| 3415 | Evobrew IDE | home23-evobrew (shared) |
| 43210 | COSMO 2.3 Research | home23-cosmo23 (shared) |
| 8090 | Home23 Dashboard | home23-dashboard |

## Publication Surfaces

- **Home23 Dashboard:** http://100.72.171.58:8090 — live data dashboard (Node.js/Express, ES modules). Sections: Home tiles, Docs, Live Data (Sauna, Pressure, Health, Weather). Replaced Python docs server on 2026-04-14.
- **Dashboard:** http://localhost:5002/home23 — AI OS home screen
- **Evobrew:** http://localhost:3415 — AI IDE

## Project Root (ABSOLUTE PATHS)

**Home23 root:** `/Users/jtr/_JTR23_/release/home23`
**jtr's home:** `/Users/jtr`

All relative paths below are under the project root.

## Runtime Directories

- Instance: `instances/jerry/` → `/Users/jtr/_JTR23_/release/home23/instances/jerry/`
- Workspace: `instances/jerry/workspace/`
- Brain: `instances/jerry/brain/`
- Conversations: `instances/jerry/conversations/`
- Cron jobs: `instances/jerry/conversations/cron-jobs.json`
- Cron run logs: `instances/jerry/conversations/cron-runs/`

## Scheduler (Cron System)

6 tools: `cron_schedule`, `cron_list`, `cron_delete`, `cron_enable`, `cron_disable`, `cron_update`.
Jobs file: `instances/jerry/conversations/cron-jobs.json` (persisted, survives restart).
Delivery targets MUST be durable IDs — Telegram numeric (`8317115546`), Discord channel, NOT dashboard session IDs.
jtr's Telegram DM: `8317115546`. Discord guild: `1480393008791818474`.
Exec jobs run from project root by default; `cwd` field overrides.
Timezone: `America/New_York` — cron expressions evaluated in this tz.

## iOS App (Home23)

- Xcode project: `/Users/jtr/xCode_Builds/Home23/`
- Bundle ID: `com.regina6.home23`
- Connects via Tailscale to bridge port 5004
- APNs key: `~/secrets/AuthKey_W2N4N6UGYS.p8`

_Last verified: 2026-04-14. Source: config.yaml + PM2 process list._


### Home23 Dashboard at port 8090
Port 8090 now runs Home23 Dashboard (Node.js/Express, pm2 name: home23-dashboard). Replaced the Python docs HTTP server that was there previously.
_Changed: Python HTTP docs server on 8090 → Node.js/Express dashboard (home23-dashboard) on 8090_
_Added: 2026-04-14_

### Health endpoint discovery
The brain service at localhost:5002 does not expose a `/health` endpoint; correct endpoint naming needs verification
_Changed: /health assumed valid endpoint for brain service → /health is not a valid endpoint for this service (Necessary to identify correct health check endpoint for reliable service monitoring)_
_Added: 2026-04-12_

### Degraded operational capability
Agent can still execute most functions (tools, research, shell, web access) despite brain service unavailability, but operates with reduced context awareness
_Changed: Assumed complete failure if brain unreachable → Brain outage causes partial degradation, not total failure (Important to understand functional scope during brain service incidents)_
_Added: 2026-04-12_

### Published docs server location
Port 8090 was the Python docs HTTP server. Now replaced by Home23 Dashboard (2026-04-14).
_Changed: Port 8090 is the published docs server port → Port 8090 is the Home23 Dashboard (Python docs server replaced)_
_Added: 2026-04-14_

### Embedding is optional for core system except home23
OpenAI is the only hard requirement for core system; embeddings and Ollama are optional infrastructure that was added for the brain, except home23 requires Ollama embedding
_Changed: (unknown prior state) → Multiple projects may have different embedding requirements (Clarifies the architecture flexibility across different deployments)_
_Added: 2026-04-12_