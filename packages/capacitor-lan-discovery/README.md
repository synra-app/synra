# @synra/capacitor-lan-discovery

Capacitor plugin for LAN device discovery.

## Install

To use npm

```bash
npm install @synra/capacitor-lan-discovery
```

To use yarn

```bash
yarn add @synra/capacitor-lan-discovery
```

Sync native files

```bash
npx cap sync
```

## Platform support

| Capability | iOS | Android | Web | Electron |
| --- | --- | --- | --- | --- |
| `startDiscovery` / `stopDiscovery` / `getDiscoveredDevices` | Yes | Yes | Mocked | Yes |
| `scanStateChanged` | Yes | Yes | Partial | Partial |
| `deviceConnectableUpdated` | Yes | Yes | Partial | Partial |
| `deviceFound` / `deviceUpdated` / `deviceLost` | No | Yes (compatibility events) | Partial | Partial |

## Notes

- `hybrid` with **`enableProbeFallback` true (default)** unions **mDNS + UDP** discovery candidates before TCP probe. With **`enableProbeFallback` false**, UDP discovery is not run in `hybrid` (mDNS + manual targets only).
- `deviceFound`, `deviceUpdated`, and `deviceLost` are currently Android-compatible events and should not be treated as cross-platform guarantees.
- `scanWindowMs` and `startedAt` can be returned by native platforms in discovery result payloads.
- This package is discovery-only. Transport opening, messaging, and pairing are handled by `@synra/capacitor-device-connection` and upper runtime modules.

## API

<docgen-index></docgen-index>

<docgen-api>
<!-- run docgen to generate docs from the source -->
<!-- More info: https://github.com/ionic-team/capacitor-docgen -->
</docgen-api>
