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
  DEVICE_TCP_CONNECT_ACK_EVENT,
  DEVICE_TCP_CONNECT_EVENT,
  LengthPrefixedJsonCodec,
  type LanFrame
} from '../protocol/lan-frame.codec'
import type { ProbeSocketRegistry } from './probe-socket-registry'

export type ProbeOptions = {
  port?: number
  timeoutMs?: number
  concurrency?: number
  localDeviceId: string
  /** Merged into each Synra `connect` payload (caller-defined wire keys). */
  probeConnectWirePayload?: Record<string, unknown>
  /** When set, successful probes keep the TCP socket for reuse by outbound transport (single TCP). */
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
    const onProbeError = () => {
      end(false)
    }
    const onProbeData = (chunk: Buffer | string) => {
      if (!Buffer.isBuffer(chunk)) {
        return
      }
      const frames = codec.decodeChunk(chunk)
      for (const frame of frames) {
        if (frame.event !== DEVICE_TCP_CONNECT_ACK_EVENT) {
          continue
        }
        const payload = toRecord(frame.payload)
        if (payload.appId !== 'synra') {
          continue
        }
        const peerDeviceId =
          typeof payload.from === 'string' && payload.from.length > 0 ? payload.from : undefined
        const ackDisplayName =
          typeof payload.displayName === 'string' ? payload.displayName.trim() : ''
        if (!ackDisplayName) {
          end(false, { connectCheckError: 'MISSING_DISPLAY_NAME' })
          return
        }
        if (options.probeSocketRegistry) {
          socket.off('data', onProbeData)
          socket.off('error', onProbeError)
          options.probeSocketRegistry.register(registryKey, {
            socket,
            codec,
            deviceId: peerDeviceId ? hashDeviceId(peerDeviceId) : device.deviceId,
            displayName: ackDisplayName
          })
          socket.on('error', () => {
            options.probeSocketRegistry?.releaseIfHeld(registryKey)
          })
          end(
            true,
            {
              deviceId: peerDeviceId ? hashDeviceId(peerDeviceId) : device.deviceId,
              name: ackDisplayName,
              port
            },
            true
          )
          return
        }
        end(true, {
          deviceId: peerDeviceId ? hashDeviceId(peerDeviceId) : device.deviceId,
          name: ackDisplayName,
          port
        })
      }
    }
    socket.on('error', onProbeError)
    socket.on('data', onProbeData)
    socket.connect(port, device.ipAddress, () => {
      const connectPayload: Record<string, unknown> = {
        appId: 'synra',
        from: options.localDeviceId,
        probe: true,
        displayName: localDisplayName(),
        ...options.probeConnectWirePayload
      }
      const sourceHostIp = pickPrimarySourceHostIp()
      if (sourceHostIp) {
        connectPayload.sourceHostIp = sourceHostIp
      }
      const connect: LanFrame = {
        requestId: randomUUID(),
        event: DEVICE_TCP_CONNECT_EVENT,
        target: device.deviceId,
        from: options.localDeviceId,
        timestamp: Date.now(),
        payload: connectPayload
      }
      socket.write(codec.encode(connect))
    })
  })
}

function toRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
}
