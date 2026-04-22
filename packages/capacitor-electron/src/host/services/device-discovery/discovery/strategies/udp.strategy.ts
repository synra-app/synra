import { createSocket } from 'node:dgram'
import type { DiscoveredDevice } from '../../../../../shared/protocol/types'
import { UDP_DISCOVERY_MAGIC, UDP_DISCOVERY_PORT } from '../../core/constants'
import { toProbeCandidate } from '../../core/device-mapper'
import { normalizeRemoteIp } from '../../core/network'
import type { DiscoveryContext, DiscoveryStrategy } from '../discovery-strategy'

export function createUdpDiscoveryStrategy(): DiscoveryStrategy {
  return {
    kind: 'udp',
    async discover(context: DiscoveryContext): Promise<DiscoveredDevice[]> {
      const socket = createSocket('udp4')
      const devicesByIp = new Map<string, DiscoveredDevice>()
      await new Promise<void>((resolve) => {
        socket.on('message', (buffer, remote) => {
          const text = buffer.toString('utf8').trim()
          const envelope = parseUdpDiscoveryEnvelope(text)
          if (!envelope) {
            return
          }
          const name = envelope.displayName?.trim()
          const normalizedIp = normalizeRemoteIp(remote.address)
          if (!normalizedIp) {
            return
          }
          if (!name) {
            return
          }
          devicesByIp.set(normalizedIp, toProbeCandidate(normalizedIp, 'probe'))
        })
        socket.bind(() => {
          socket.setBroadcast(true)
          const payload = Buffer.from(UDP_DISCOVERY_MAGIC, 'utf8')
          socket.send(payload, UDP_DISCOVERY_PORT, '255.255.255.255')
          setTimeout(resolve, context.timeoutMs)
        })
      })
      socket.close()
      return [...devicesByIp.values()]
    }
  }
}

function parseUdpDiscoveryEnvelope(
  text: string
): { displayName?: string; appId: string; protocolVersion?: string } | undefined {
  const payloadText = resolveUdpDiscoveryPayload(text)
  if (!payloadText) {
    return undefined
  }
  try {
    const parsed = JSON.parse(payloadText) as {
      appId?: unknown
      protocolVersion?: unknown
      displayName?: unknown
    }
    if (parsed.appId !== 'synra') {
      return undefined
    }
    return {
      appId: 'synra',
      protocolVersion:
        typeof parsed.protocolVersion === 'string' ? parsed.protocolVersion : undefined,
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : undefined
    }
  } catch {
    return undefined
  }
}

function resolveUdpDiscoveryPayload(text: string): string | undefined {
  if (text.startsWith(UDP_DISCOVERY_MAGIC)) {
    const payloadText = text.slice(UDP_DISCOVERY_MAGIC.length).trim()
    return payloadText.startsWith('{') ? payloadText : undefined
  }
  if (text.startsWith('{')) {
    return text
  }
  return undefined
}
