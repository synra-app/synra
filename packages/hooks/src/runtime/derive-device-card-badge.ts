import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'

export type ScanPhase = 'idle' | 'scanning'

export type DeviceCardBadge =
  | { tag: 'spinner' }
  | { tag: 'glow'; tone: 'success' | 'failure' | 'warning' }

function isHardFailure(code: string | undefined): boolean {
  if (!code) {
    return false
  }
  const upper = code.toUpperCase()
  return (
    upper.includes('TIMEOUT') ||
    upper.includes('FAILED') ||
    upper.includes('REFUSED') ||
    upper.includes('NETWORK') ||
    upper.includes('HELLO_ACK') ||
    upper.includes('PROBE_') ||
    upper.includes('SOCKET') ||
    upper.includes('CONNECTION')
  )
}

/**
 * Pure view-model for device list handshake / probe status (no template-level flag combinatorics).
 */
export function deriveDeviceCardBadge(
  device: Pick<DiscoveredDevice, 'connectable' | 'connectCheckError'>,
  scanPhase: ScanPhase
): DeviceCardBadge {
  if (scanPhase === 'scanning') {
    return { tag: 'spinner' }
  }
  if (device.connectable) {
    return { tag: 'glow', tone: 'success' }
  }
  if (device.connectCheckError && isHardFailure(device.connectCheckError)) {
    return { tag: 'glow', tone: 'failure' }
  }
  return { tag: 'glow', tone: 'warning' }
}
