import { createSocket } from 'node:dgram'
import type { DiscoveredDevice } from '../../../../../shared/protocol/types'
import { UDP_DISCOVERY_MAGIC, UDP_DISCOVERY_PORT } from '../../core/constants'
import { toDiscoveredDevice } from '../../core/device-mapper'
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
          if (!text.startsWith(UDP_DISCOVERY_MAGIC)) {
            return
          }
          const payloadText = text.slice(UDP_DISCOVERY_MAGIC.length).trim()
          const name = payloadText.startsWith('{') ? safeReadName(payloadText) : undefined
          const normalizedIp = normalizeRemoteIp(remote.address)
          if (!normalizedIp) {
            return
          }
          devicesByIp.set(
            normalizedIp,
            toDiscoveredDevice(normalizedIp, 'probe', name ?? `Synra Device ${normalizedIp}`)
          )
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

function safeReadName(jsonText: string): string | undefined {
  try {
    const parsed = JSON.parse(jsonText) as { displayName?: unknown }
    return typeof parsed.displayName === 'string' ? parsed.displayName : undefined
  } catch {
    return undefined
  }
}
