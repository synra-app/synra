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

| Capability                                                                 | iOS                      | Android                    | Web     | Electron                      |
| -------------------------------------------------------------------------- | ------------------------ | -------------------------- | ------- | ----------------------------- |
| `startDiscovery` / `stopDiscovery` / `getDiscoveredDevices`                | Yes                      | Yes                        | Mocked  | Yes                           |
| `ensureOutboundSession` (hello → keep-alive TCP; same socket as discovery) | Yes                      | Yes                        | No      | Yes (`discovery.openSession`) |
| `sendMessage` / `closeSession`                                             | Yes (inbound + outbound) | Yes (inbound + outbound)   | No      | Yes                           |
| `scanStateChanged` / `sessionOpened` / `sessionClosed` / `messageReceived` | Yes                      | Yes                        | Partial | Partial                       |
| `transportError`                                                           | Yes                      | Yes                        | No      | No                            |
| `deviceFound` / `deviceUpdated` / `deviceLost`                             | No                       | Yes (compatibility events) | Partial | Partial                       |

## Notes

- `hybrid` discovery mode uses mDNS first, and falls back to UDP only when mDNS does not produce candidates.
- `deviceFound`, `deviceUpdated`, and `deviceLost` are currently Android-compatible events and should not be treated as cross-platform guarantees.
- `scanWindowMs` and `startedAt` can be returned by native platforms in discovery result payloads.

## API

<docgen-index></docgen-index>

<docgen-api>
<!-- run docgen to generate docs from the source -->
<!-- More info: https://github.com/ionic-team/capacitor-docgen -->
</docgen-api>
