import { computed, type ComputedRef, type Ref } from 'vue'
import type { SynraHookDevice } from '@synra/plugin-sdk/hooks'
import type { ChatDevice, ChatSession } from '../src/types/chat'

export function useChatDevicesView(options: {
  rawDevices: Ref<readonly SynraHookDevice[]>
  activeSessions: ComputedRef<ChatSession[]>
  selectedDeviceId: Ref<string>
}): { devices: ComputedRef<ChatDevice[]> } {
  const { rawDevices, activeSessions, selectedDeviceId } = options

  const devices = computed<ChatDevice[]>(() => {
    const sessionByDeviceId = new Map(
      activeSessions.value
        .filter((item) => typeof item.deviceId === 'string' && item.deviceId.length > 0)
        .map((item) => [item.deviceId as string, item])
    )

    return rawDevices.value
      .map((device) => {
        const linkedSession = sessionByDeviceId.get(device.deviceId)
        return {
          deviceId: device.deviceId,
          name:
            typeof device.name === 'string' && device.name.length > 0
              ? device.name
              : device.deviceId,
          ipAddress: typeof device.ipAddress === 'string' ? device.ipAddress : undefined,
          source: typeof device.source === 'string' ? device.source : undefined,
          connectable: Boolean(device.connectable),
          connectCheckError:
            typeof device.connectCheckError === 'string' ? device.connectCheckError : undefined,
          lastSeenAt: typeof device.lastSeenAt === 'number' ? device.lastSeenAt : undefined,
          lastSeenLabel:
            typeof device.lastSeenAt === 'number'
              ? new Date(device.lastSeenAt).toLocaleTimeString()
              : 'unknown',
          sessionId: linkedSession?.sessionId,
          sessionStatus: linkedSession?.status,
          isSelected: selectedDeviceId.value === device.deviceId
        }
      })
      .sort((left, right) => (right.lastSeenAt ?? 0) - (left.lastSeenAt ?? 0))
  })

  return { devices }
}
