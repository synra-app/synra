# MVP Prototype Alignment Note

## Scope

This note records what the current prototype has aligned with the contracts in `ai-docs/main`, and what remains intentionally out of scope for this iteration.

## Aligned Items

- Added protocol types for namespaced runtime lifecycle messages:
  - `runtime.request`
  - `runtime.received`
  - `runtime.started`
  - `runtime.finished`
  - `runtime.error`
- Added minimal plugin catalog message types:
  - `plugin.catalog.request`
  - `plugin.catalog.response`
- Added `RuntimeFinishedStatus` and structured protocol error payloads.
- Added loopback transport in `@synra/transport-core` with:
  - message delivery
  - duplicate `messageId` suppression
  - pre-send unreachable/disconnected errors
- Added minimal runtime orchestrator in `@synra/capacitor-electron`:
  - plugin register/unregister/list
  - `resolveActions()`
  - `executeSelected()`
  - lifecycle emission (`received -> started -> finished`)
- Added bridge methods for runtime and catalog:
  - `runtime.resolveActions`
  - `runtime.execute`
  - `plugin.catalog.get`
- Added in-repo GitHub demo plugin (`github-open`) backed by existing `external.open` host capability.
- Added end-to-end tests covering:
  - `catalog -> resolveActions -> runtime.execute`
  - runtime lifecycle order
  - duplicate `messageId` replay does not trigger duplicate execution

## Deferred Items

- Real LAN transport package (`@synra/transport-lan`) and device discovery/pairing flow.
- Relay transport package (`@synra/transport-relay`) and cloud relay behavior.
- Production plugin isolation model (Worker/subprocess boundary hardening).
- Full plugin bundle/rules synchronization (`plugin.bundle.*` and `plugin.rules.*`) with integrity enforcement.
- Device-side sandbox page runtime and controlled bridge for plugin pages.
- Full telemetry matrix for weak network, reconnect, and delivery guarantees.

## Compatibility Notes

- Existing legacy `share.detected` / `action.*` protocol contracts are preserved for compatibility.
- New namespaced protocol contracts are additive and used by the new runtime prototype path.
- Current transport E2E verification uses loopback simulation instead of real cross-device networking.
