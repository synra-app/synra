import type { Pinia } from 'pinia'
import type { ShallowRef } from 'vue'
import { getConnectionRuntime } from '@synra/hooks'
import {
  createPairingProtocolContext,
  type PairingProtocolContext
} from '../composables/use-pairing-protocol-context'

export async function registerPairingProtocol(
  pinia: Pinia,
  holder: ShallowRef<PairingProtocolContext | null>
): Promise<void> {
  const runtime = getConnectionRuntime()
  await runtime.ensureListeners()
  const ctx = createPairingProtocolContext(pinia)
  ctx.registerLanSynraWireHandlers()
  holder.value = ctx
}
