import { createSocket } from 'node:dgram'
import { networkInterfaces } from 'node:os'
import type { DiscoveredDevice } from '../../../../../shared/protocol/types'
import { UDP_DISCOVERY_MAGIC, UDP_DISCOVERY_PORT } from '../../core/constants'
import { toProbeCandidate } from '../../core/device-mapper'
import { normalizeRemoteIp } from '../../core/network'
import type { DiscoveryContext, DiscoveryStrategy } from '../discovery-strategy'

export function createUdpDiscoveryStrategy(): DiscoveryStrategy {
  return {
    kind: 'udp',
    // SYNRA-COMM::UDP_DISCOVERY::CONNECT::DISCOVERY_SCAN
    async discover(context: DiscoveryContext): Promise<DiscoveredDevice[]> {
      const socket = createSocket('udp4')
      const devicesByIp = new Map<string, DiscoveredDevice>()
      const destinations = collectUdpBroadcastDestinations()
      await new Promise<void>((resolve) => {
        // SYNRA-COMM::UDP_DISCOVERY::RECEIVE::DISCOVERY_RESPONSE
        socket.on('message', (buffer, remote) => {
          const text = buffer.toString('utf8').trim()
          const envelope = parseUdpDiscoveryEnvelope(text)
          if (!envelope) {
            return
          }
          const normalizedIp = normalizeRemoteIp(remote.address)
          if (!normalizedIp) {
            return
          }
          // UDP payload may omit displayName (e.g. iOS). Candidates are IPv4 + Synra appId only;
          // discovery requires a non-empty displayName from the Synra TCP connectAck (see probe-runner).
          devicesByIp.set(
            normalizedIp,
            toProbeCandidate(normalizedIp, 'probe', undefined, envelope.sourceDeviceId)
          )
        })
        // SYNRA-COMM::UDP_DISCOVERY::SEND::DISCOVERY_BROADCAST
        socket.bind(() => {
          socket.setBroadcast(true)
          const payload = Buffer.from(UDP_DISCOVERY_MAGIC, 'utf8')
          for (const destination of destinations) {
            socket.send(payload, UDP_DISCOVERY_PORT, destination)
          }
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
):
  | { displayName?: string; appId: string; protocolVersion?: string; sourceDeviceId?: string }
  | undefined {
  const payloadText = resolveUdpDiscoveryPayload(text)
  if (!payloadText) {
    return undefined
  }
  try {
    const parsed = JSON.parse(payloadText) as {
      appId?: unknown
      protocolVersion?: unknown
      displayName?: unknown
      sourceDeviceId?: unknown
    }
    if (parsed.appId !== 'synra') {
      return undefined
    }
    return {
      appId: 'synra',
      protocolVersion:
        typeof parsed.protocolVersion === 'string' ? parsed.protocolVersion : undefined,
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : undefined,
      sourceDeviceId:
        typeof parsed.sourceDeviceId === 'string' && parsed.sourceDeviceId.trim().length > 0
          ? parsed.sourceDeviceId.trim()
          : undefined
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

function collectUdpBroadcastDestinations(): string[] {
  const destinations = new Set<string>(['255.255.255.255'])
  const interfaces = networkInterfaces()
  for (const records of Object.values(interfaces)) {
    for (const record of records ?? []) {
      if (record.family !== 'IPv4' || record.internal) {
        continue
      }
      if (typeof record.cidr !== 'string' || record.cidr.length === 0) {
        continue
      }
      const [ipText, prefixText] = record.cidr.split('/')
      const prefix = Number(prefixText)
      if (!ipText || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
        continue
      }
      const ipInt = ipv4ToInt(ipText)
      if (ipInt === undefined) {
        continue
      }
      const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
      const broadcastInt = (ipInt & mask) | (~mask >>> 0)
      const broadcast = intToIpv4(broadcastInt >>> 0)
      if (broadcast) {
        destinations.add(broadcast)
      }
    }
  }
  return [...destinations]
}

function ipv4ToInt(ip: string): number | undefined {
  const parts = ip.split('.')
  if (parts.length !== 4) {
    return undefined
  }
  const nums = parts.map((part) => Number(part))
  if (nums.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return undefined
  }
  return (
    (((nums[0] ?? 0) << 24) | ((nums[1] ?? 0) << 16) | ((nums[2] ?? 0) << 8) | (nums[3] ?? 0)) >>> 0
  )
}

function intToIpv4(value: number): string {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff].join(
    '.'
  )
}
