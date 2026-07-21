import 'uno.css'
import './styles/main.scss'
import { useLogger } from '@synra/hooks'
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
// v3 plugin contract — keep every Vue public API alive in the host's
// tree-shake so plugin bundles can resolve them through importmap.
// `@/plugins/host/synra-vue-reexport.ts` — see that file for context.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import './plugins/host/synra-vue-reexport'

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
const { tcpLogger } = useLogger()

tcpLogger.info('frontend main')

app.mount('#app')
