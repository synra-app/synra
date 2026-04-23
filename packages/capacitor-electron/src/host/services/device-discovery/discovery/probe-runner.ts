import { randomUUID } from 'node:crypto'
import { Socket } from 'node:net'
import type { DiscoveredDevice } from '../../../../shared/protocol/types'
import {
  DEFAULT_PROBE_CONCURRENCY,
  DEFAULT_PROBE_TIMEOUT_MS,
  DEFAULT_TCP_PORT
} from '../core/constants'
import { hashDeviceId, localDisplayName } from '../core/device-identity'
import { pickPrimarySourceHostIp } from '../core/network'
import {
  LAN_PROTOCOL_VERSION,
  LengthPrefixedJsonCodec,
  type LanFrame
} from '../protocol/lan-frame.codec'
import type { ProbeSocketRegistry } from './probe-socket-registry'

export type ProbeOptions = {
  port?: number
  timeoutMs?: number
  concurrency?: number
  localDeviceId: string
  /** When set, successful probes keep the TCP socket for reuse by outbound sessions (single TCP). */
  probeSocketRegistry?: ProbeSocketRegistry
}

export async function probeDevices(
  devices: DiscoveredDevice[],
  options: ProbeOptions
): Promise<DiscoveredDevice[]> {
  const pending = [...devices]
  const results: DiscoveredDevice[] = []
  const workerCount = Math.max(
    1,
    Math.min(options.concurrency ?? DEFAULT_PROBE_CONCURRENCY, pending.length || 1)
  )

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (pending.length > 0) {
        const next = pending.shift()
        if (!next) {
          return
        }
        results.push(await probeSingle(next, options))
      }
    })
  )

  return results
}

async function probeSingle(
  device: DiscoveredDevice,
  options: ProbeOptions
): Promise<DiscoveredDevice> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS
  const port = options.port ?? DEFAULT_TCP_PORT
  const socket = new Socket()
  const codec = new LengthPrefixedJsonCodec()
  const registryKey = `${device.ipAddress}:${port}`

  return new Promise<DiscoveredDevice>((resolve) => {
    const end = (
      connectable: boolean,
      nextDevice?: Partial<DiscoveredDevice>,
      keepSocket = false
    ) => {
      clearTimeout(timer)
      if (!keepSocket) {
        socket.destroy()
      }
      resolve({
        ...device,
        ...nextDevice,
        connectable,
        connectCheckAt: Date.now(),
        connectCheckError: connectable
          ? undefined
          : (nextDevice?.connectCheckError ?? 'PROBE_FAILED'),
        lastSeenAt: Date.now()
      })
    }
    const timer = setTimeout(() => end(false, { connectCheckError: 'PROBE_TIMEOUT' }), timeoutMs)
    socket.on('error', () => {
      end(false)
    })
    socket.on('data', (chunk) => {
      if (!Buffer.isBuffer(chunk)) {
        return
      }
      const frames = codec.decodeChunk(chunk)
      for (const frame of frames) {
        if (frame.type !== 'helloAck') {
          continue
        }
        const payload = toRecord(frame.payload)
        const peerDeviceId =
          typeof payload.sourceDeviceId === 'string' && payload.sourceDeviceId.length > 0
            ? payload.sourceDeviceId
            : undefined
        const ackSessionId =
          typeof frame.sessionId === 'string' && frame.sessionId.length > 0 ? frame.sessionId : ''
        if (options.probeSocketRegistry && ackSessionId.length > 0) {
          socket.removeAllListeners()
          options.probeSocketRegistry.register(registryKey, {
            socket,
            codec,
            sessionId: ackSessionId,
            displayName: typeof payload.displayName === 'string' ? payload.displayName : undefined
          })
          end(
            true,
            {
              deviceId: peerDeviceId ? hashDeviceId(peerDeviceId) : device.deviceId,
              name: typeof payload.displayName === 'string' ? payload.displayName : device.name,
              port
            },
            true
          )
          return
        }
        end(true, {
          deviceId: peerDeviceId ? hashDeviceId(peerDeviceId) : device.deviceId,
          name: typeof payload.displayName === 'string' ? payload.displayName : device.name,
          // Keep the resolved connect port so UI can show actionable endpoint info.
          port
        })
      }
    })
    socket.connect(port, device.ipAddress, () => {
      const helloPayload: Record<string, unknown> = {
        sourceDeviceId: options.localDeviceId,
        probe: true,
        displayName: localDisplayName()
      }
      const sourceHostIp = pickPrimarySourceHostIp()
      if (sourceHostIp) {
        helloPayload.sourceHostIp = sourceHostIp
      }
      const hello: LanFrame = {
        version: LAN_PROTOCOL_VERSION,
        type: 'hello',
        sessionId: randomUUID(),
        timestamp: Date.now(),
        appId: 'synra',
        protocolVersion: LAN_PROTOCOL_VERSION,
        payload: helloPayload
      }
      socket.write(codec.encode(hello))
    })
  })
}

function toRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
}
