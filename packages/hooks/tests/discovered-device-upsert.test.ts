import { expect, test } from 'vite-plus/test'
import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import { ref } from 'vue'
import { upsertDiscoveredPeerFromTransportOpened } from '../src/runtime/discovered-device-upsert'

test('upsertDiscoveredPeerFromTransportOpened uses fallback name when displayName missing', () => {
  const devices = ref<DiscoveredDevice[]>([])
  upsertDiscoveredPeerFromTransportOpened(devices, {
    deviceId: 'device-abcabcdef',
    host: '10.0.0.5',
    port: 32100
  })
  expect(devices.value).toHaveLength(1)
  expect(devices.value[0]?.name.startsWith('Peer')).toBe(true)
  expect(devices.value[0]?.ipAddress).toBe('10.0.0.5')
})
