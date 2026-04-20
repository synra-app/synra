import 'uno.css'
import './styles/main.scss'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'
import App from './App.vue'
import { setupSynraRuntime } from './bootstrap/setup-synra-runtime'

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/', redirect: '/home' }, ...routes]
})

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
setupSynraRuntime(pinia)

app.mount('#app')
