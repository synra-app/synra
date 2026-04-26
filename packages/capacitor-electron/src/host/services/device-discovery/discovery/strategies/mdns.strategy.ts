import { lookup } from 'node:dns/promises'
import { Bonjour } from 'bonjour-service'
import type { DiscoveredDevice } from '../../../../../shared/protocol/types'
import { DEFAULT_MDNS_SERVICE_TYPE } from '../../core/constants'
import { toProbeCandidate } from '../../core/device-mapper'
import { normalizeRemoteIp } from '../../core/network'
import type { DiscoveryContext, DiscoveryStrategy } from '../discovery-strategy'

function parseMdnsServiceType(serviceType?: string): { type: string; protocol: 'tcp' | 'udp' } {
  const normalized = (
    serviceType && serviceType.length > 0 ? serviceType : DEFAULT_MDNS_SERVICE_TYPE
  )
    .trim()
    .replace(/^\./, '')
    .replace(/\.local\.?$/, '')
  const segments = normalized.split('.').filter((segment) => segment.length > 0)
  if (segments.length >= 2) {
    const typeSegment = segments[0] ?? '_synra'
    const protocolSegment = segments[1] === '_udp' ? 'udp' : 'tcp'
    return {
      type: typeSegment.replace(/^_/, ''),
      protocol: protocolSegment
    }
  }
  return { type: 'synra', protocol: 'tcp' }
}

export function createMdnsDiscoveryStrategy(): DiscoveryStrategy {
  return {
    kind: 'mdns',
    async discover(context: DiscoveryContext): Promise<DiscoveredDevice[]> {
      const typeSpec = parseMdnsServiceType(context.options.mdnsServiceType)
      const devicesByIp = new Map<string, DiscoveredDevice>()
      const pendingHostnameResolutions: Promise<void>[] = []
      const bonjour = new Bonjour()
      const browser = bonjour.find({
        type: typeSpec.type,
        protocol: typeSpec.protocol
      })
      const pushCandidate = (
        candidate: string | undefined,
        port?: number,
        sourceDeviceUuid?: string
      ) => {
        const normalizedIp = normalizeRemoteIp(candidate)
        if (normalizedIp && !normalizedIp.includes(':')) {
          devicesByIp.set(
            normalizedIp,
            toProbeCandidate(normalizedIp, 'mdns', port, sourceDeviceUuid)
          )
          return
        }
        if (!candidate || candidate.trim().length === 0) {
          return
        }
        // Some Android NSD stacks expose hostnames (e.g. *.local) instead of IPv4 addresses.
        // Resolve hostname to IPv4 so Electron can still probe Synra peers.
        const hostname = candidate.trim().replace(/\.$/, '')
        if (hostname.includes(':')) {
          return
        }
        pendingHostnameResolutions.push(
          lookup(hostname, { family: 4 })
            .then((resolved) => {
              const ip = normalizeRemoteIp(resolved.address)
              if (ip && !ip.includes(':')) {
                devicesByIp.set(ip, toProbeCandidate(ip, 'mdns', port, sourceDeviceUuid))
              }
            })
            .catch(() => undefined)
        )
      }
      const onUp = (service: {
        addresses?: string[]
        referer?: { address?: string }
        host?: string
        name?: string
        port?: number
        txt?: { sourceDeviceId?: string }
      }) => {
        if (service.txt?.sourceDeviceId === context.localDeviceUuid) {
          return
        }
        const candidates = [
          ...(service.addresses ?? []),
          service.referer?.address ?? '',
          service.host ?? ''
        ]
        const sourceDeviceUuid =
          typeof service.txt?.sourceDeviceId === 'string' &&
          service.txt.sourceDeviceId.trim().length > 0
            ? service.txt.sourceDeviceId.trim()
            : undefined
        for (const candidate of candidates) {
          pushCandidate(candidate, service.port, sourceDeviceUuid)
        }
      }
      browser.on('up', onUp)

      await new Promise<void>((resolve) => {
        setTimeout(resolve, context.timeoutMs)
      })

      browser.stop()
      bonjour.destroy()
      await Promise.allSettled(pendingHostnameResolutions)
      return [...devicesByIp.values()]
    }
  }
}
