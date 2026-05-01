# iOS Parity And Shared Contract Plan

The iOS app should stay separate from the main Home23 runtime, but the API contract should live with main Home23. That gives backend, web, and iOS a shared source of truth without importing Xcode, signing, APNs, and TestFlight concerns into the core repo.

## Target Shape

```text
home23/
  contracts/
    schemas/
    fixtures/
  docs/
    ios-parity.md
  tests/
    contract/

Home23-iOS/
  contracts/              # generated/copied snapshot during transition
  Home23ContractTests/    # fixture decode checks
```

## Contract Surfaces

| Surface | iOS usage | Contract files |
| --- | --- | --- |
| Agent roster | selected/current/primary resolution, dashboard and bridge ports | `agent-roster.schema.json` |
| Chat | turn start, stream events, pending turns, history, conversations, models | `chat.schema.json` |
| Settings control plane | status, scope, model defaults, query defaults, agent actions | `settings.schema.json` |
| Query | defaults, provider catalog, brain registry, request/result/stream/export | `query.schema.json` |
| Home cards | summary, pulse, goals, dreams, sensors, memory, vibe | `home-surfaces.schema.json` |
| Sauna | tile state and start/stop actions | `sauna.schema.json` |
| Client handshake | backend feature/version discovery | `client-capabilities.schema.json` |

## Parity Matrix

| Capability | Web/Main Home23 | iOS | Contract status | Notes |
| --- | ---: | ---: | --- | --- |
| Multi-agent roster | yes | yes | seeded | Required for all selected-agent surfaces |
| Selected-agent dashboard cards | yes | yes | seeded | iOS must use `dashboardURL(for:)` |
| Selected-agent chat bridge | yes | yes | seeded | iOS must use `bridgeURL(for:)` |
| Query dashboard parity | yes | yes | seeded | Native port should follow web query contract |
| Settings model/query control | yes | yes | seeded | Per-agent settings must remain explicit |
| Agent lifecycle actions | yes | yes | seeded | POST action responses use common save response |
| Sauna tile control | yes | yes | seeded | Currently global dashboard URL in iOS |
| Media serving | yes | yes | documented | Binary endpoint, query param contract only |
| Client capability handshake | needed | not yet | proposed | Add `/home23/api/client-capabilities` |
| Contract tests | needed | needed | not yet | Backend validates schemas, iOS decodes fixtures |

## First Implementation Steps

1. Move or copy `contracts/` into the main Home23 repo.
2. Add backend tests that validate representative endpoint responses against the JSON schemas.
3. Add `/home23/api/client-capabilities` using `fixtures/client-capabilities.json` as the first payload shape.
4. Add an iOS test target that decodes every JSON fixture into the matching Swift wire type.
5. During API changes, update schema + fixture first, backend second, iOS third.

## Routing Rules To Preserve

- Home, Query, and selected-agent dashboard surfaces use the selected agent dashboard port.
- Chat uses the selected agent bridge port.
- Roster discovery still starts from the house dashboard at port `5002`.
- Binary media remains served from `/home23/api/media?path=...`.
- Optional fields should stay optional unless every deployed iOS build can tolerate the requirement.
