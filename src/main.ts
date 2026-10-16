import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { i18n } from './i18n'
import { useBrandingStore } from './stores/branding'
import './style.css'
import './api/client'
import './plugins/chartjs'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(i18n)

// Company name + logo, on every page including the sign-in ones.
void useBrandingStore(pinia).load()

app.mount('#app')
