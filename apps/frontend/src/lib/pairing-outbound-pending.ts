import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'

type Pending = {
  target: DiscoveredDevice
}

const pendingByRequestId = new Map<string, Pending>()

export function registerPairingOutbound(requestId: string, target: DiscoveredDevice): void {
  pendingByRequestId.set(requestId, { target })
}

export function consumePairingOutbound(requestId: string): Pending | undefined {
  const entry = pendingByRequestId.get(requestId)
  pendingByRequestId.delete(requestId)
  return entry
}
