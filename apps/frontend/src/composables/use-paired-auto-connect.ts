import type { Pinia } from 'pinia'
import { storeToRefs } from 'pinia'
import { computed, watch } from 'vue'
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
  const { peers, openTransportLinks } = storeToRefs(store)
  const { pairedRecords } = storeToRefs(pairingStore)
  const reconStore = usePairedReconnectStore(pinia)
  const readyDeviceIds = computed(
    () =>
      new Set(
        openTransportLinks.value
          .filter(
            (link) =>
              link.transport === 'ready' &&
              typeof link.deviceId === 'string' &&
              link.deviceId.length > 0
          )
          .map((link) => link.deviceId)
      )
  )

  const pairedDeviceIds = computed(() => pairedRecords.value.map((row) => row.deviceId))

  const scheduler = new PairedReconnectScheduler({
    isTransportReady: (deviceId) => readyDeviceIds.value.has(deviceId),
    tryConnect: async (deviceId) => {
      const record = pairedRecords.value.find((row) => row.deviceId === deviceId)
      if (!record) {
        return false
      }
      return tryOpenTransportForPairedRecord(
        {
          isTransportReady: (id) => readyDeviceIds.value.has(id),
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

  function runTransportPairedSync(): void {
    const now = new Set(readyDeviceIds.value)
    const paired = new Set(pairedDeviceIds.value)
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
    [readyDeviceIds, pairedDeviceIds],
    () => {
      runTransportPairedSync()
    },
    { flush: 'post', immediate: true }
  )
}
