import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, t } from '@/i18n'
import { COMPANY_CODE_KEY } from '@/api/companyCode'
import PinLoginPage from './PinLoginPage.vue'

// The server: company CM, named "CM Shop", with one till; no other code.
const server = vi.hoisted(() => ({ brandingAsked: [] as string[] }))
vi.mock('@/api/settings', () => ({
  listPublicTills: async (code: string) => {
    if (code === 'CM') return [{ deviceKey: 'CM-TILL-1', name: 'Till 1', branchId: 1, branchName: 'Toul Kork' }]
    throw Object.assign(new Error('Request failed with status code 404'), {
      isAxiosError: true,
      response: { status: 404, data: { error: { code: 'UNKNOWN_COMPANY', message: 'No company has that code.' } } },
    })
  },
  getBranding: async (code: string) => {
    server.brandingAsked.push(code)
    return { companyName: code === 'CM' ? 'CM Shop' : '', hasLogo: false, logoLink: '', logoVersion: '' }
  },
}))

let app: App | null = null
let host: HTMLElement

async function settle() {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r))
    await nextTick()
  }
}

async function mount() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['login', 'dashboard', 'pos'].map((name) => ({ path: `/${name}`, name, component: { render: () => null } })),
  })
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(PinLoginPage).use(createPinia()).use(router).use(i18n)
  app.mount(host)
  await settle()
}

const heading = () => host.querySelector('h1')?.textContent ?? ''
const appHeading = () => t('pos.signInTitle', { brand: t('app.brand') })

beforeEach(() => {
  localStorage.clear()
  server.brandingAsked = []
})

afterEach(() => {
  app?.unmount()
  app = null
  host.remove()
})

describe('the till sign-in screen and its company', () => {
  it('shows the remembered company, and the app’s own name after "Change company"', async () => {
    localStorage.setItem(COMPANY_CODE_KEY, 'CM')
    await mount()
    expect(heading()).toBe(t('pos.signInTitle', { brand: 'CM Shop' }))

    const change = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === t('pos.changeCompany'))
    expect(change).toBeDefined()
    change!.click()
    await settle()

    expect(host.querySelector('#company-code')).not.toBeNull()
    expect(heading()).toBe(appHeading())
    expect(localStorage.getItem(COMPANY_CODE_KEY)).toBeNull()
    // Without asking the server, so it works offline too.
    expect(server.brandingAsked).not.toContain('')
  })

  it('forgets a remembered company the server no longer knows, name included', async () => {
    localStorage.setItem(COMPANY_CODE_KEY, 'GONE')
    // What the screen showed for it last time.
    localStorage.setItem('com-mart-branding', JSON.stringify({ companyName: 'Gone Ltd', hasLogo: false, logoLink: '', logoVersion: '' }))
    await mount()

    expect(host.querySelector('#company-code')).not.toBeNull()
    expect(heading()).toBe(appHeading())
    expect(localStorage.getItem(COMPANY_CODE_KEY)).toBeNull()
  })
})
