# Changelog

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
