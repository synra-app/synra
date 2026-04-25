import 'uno.css'
import './styles/main.scss'
import { configureHooksRuntime } from '@synra/hooks'
import { createPinia } from 'pinia'
import { createApp, shallowRef } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'
import App from './App.vue'
import { setupSynraRuntime } from './bootstrap/setup-synra-runtime'
import {
  PAIRING_PROTOCOL_KEY,
  type PairingProtocolContext
} from './composables/use-pairing-protocol-context'
import { isPairedDeviceExcludedFromDiscovery } from './lib/discovery-paired-exclusion'

configureHooksRuntime({
  shouldExcludeDiscoveredDevice: (deviceId) => isPairedDeviceExcludedFromDiscovery(deviceId)
})

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/', redirect: '/home' }, ...routes]
})

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

const pairingProtocolHolder = shallowRef<PairingProtocolContext | null>(null)
app.provide(PAIRING_PROTOCOL_KEY, pairingProtocolHolder)
setupSynraRuntime(pinia, pairingProtocolHolder)

console.log('frontend main')

app.mount('#app')
