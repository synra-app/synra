import type { Pinia } from 'pinia'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'
import { pairedDevicesStorageEpoch } from '@synra/hooks'
import { listPairedDeviceRecords } from '../lib/paired-devices-storage'
import { tryOpenTransportForPairedRecord } from '../lib/connect-paired-record'
import { PairedReconnectScheduler } from '../lib/paired-reconnect-scheduler'
import { useLanDiscoveryStore } from '../stores/lan-discovery'
import { usePairingStore } from '../stores/pairing'
import { usePairedReconnectStore } from '../stores/paired-reconnect'

/**
 * Keeps outbound transport open for persisted paired peers using bounded backoff
 * (3s / 5s / 10s) and manual reconnect after three failed attempts.
 */
export function registerPairedAutoConnect(pinia: Pinia): void {
  const store = useLanDiscoveryStore(pinia)
  const pairingStore = usePairingStore(pinia)
  const { peers, transportReadyDeviceIds } = storeToRefs(store)
  const { pairedListEpoch } = storeToRefs(pairingStore)
  const reconStore = usePairedReconnectStore(pinia)

  const scheduler = new PairedReconnectScheduler({
    isTransportReady: (deviceId) => transportReadyDeviceIds.value.includes(deviceId),
    tryConnect: async (deviceId) => {
      const records = await listPairedDeviceRecords()
      const record = records.find((row) => row.deviceId === deviceId)
      if (!record) {
        return false
      }
      return tryOpenTransportForPairedRecord(
        {
          isTransportReady: (id) => transportReadyDeviceIds.value.includes(id),
          peers: () => peers.value,
          connectToDevice: store.connectToDevice,
          connectToDeviceAt: store.connectToDeviceAt
        },
        record
      )
    },
    onGaveUp: (id) => {
      reconStore.setGaveUp(id)
    },
    onCleared: (id) => {
      reconStore.clearGaveUp(id)
    }
  })
  reconStore.assignScheduler(scheduler)

  let lastReady: Set<string> | null = null
  let lastPaired: Set<string> = new Set()

  async function runTransportPairedSync(): Promise<void> {
    const now = new Set(transportReadyDeviceIds.value)
    const records = await listPairedDeviceRecords()
    const paired = new Set(records.map((row) => row.deviceId))
    const sched = reconStore.getScheduler()
    if (!sched) {
      return
    }
    if (lastReady === null) {
      lastReady = new Set(now)
      lastPaired = paired
      for (const id of paired) {
        if (!now.has(id)) {
          sched.onBecameNotReadyShouldSchedule(id, reconStore.isGaveUp(id))
        }
      }
      return
    }
    for (const id of paired) {
      if (!lastPaired.has(id) && !now.has(id)) {
        sched.onBecameNotReadyShouldSchedule(id, reconStore.isGaveUp(id))
      }
    }
    for (const id of lastReady) {
      if (!now.has(id) && paired.has(id)) {
        sched.onBecameNotReadyShouldSchedule(id, reconStore.isGaveUp(id))
      }
    }
    for (const id of now) {
      if (!lastReady.has(id)) {
        sched.onBecameReady(id)
      }
    }
    lastReady = new Set(now)
    lastPaired = paired
  }

  watch(
    [transportReadyDeviceIds, pairedListEpoch, pairedDevicesStorageEpoch],
    () => {
      void runTransportPairedSync()
    },
    { flush: 'post', immediate: true }
  )
}
