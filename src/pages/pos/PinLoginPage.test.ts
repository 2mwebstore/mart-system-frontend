import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { i18n, t } from '@/i18n'
import { COMPANY_CODE_KEY } from '@/api/companyCode'
import { useAuthStore } from '@/stores/auth'
import type { PublicTill } from '@/types/domain'
import PinLoginPage from './PinLoginPage.vue'

// The server: company CM, named "CM Shop", with one till unless a test says
// otherwise; no other code.
const oneTill: PublicTill[] = [{ deviceKey: 'CM-TILL-1', name: 'Till 1', branchId: 1, branchName: 'Toul Kork' }]
const server = vi.hoisted(() => ({ brandingAsked: [] as string[], tills: [] as PublicTill[] }))
vi.mock('@/api/settings', () => ({
  listPublicTills: async (code: string) => {
    if (code === 'CM') return server.tills
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
let router: Router

async function settle() {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r))
    await nextTick()
  }
}

// signedIn: what the store holds before the screen opens, as after a
// back-office sign-in (or a PIN one, with the PIN flag stored first).
async function mount(signedIn?: (auth: ReturnType<typeof useAuthStore>) => void) {
  router = createRouter({
    history: createMemoryHistory(),
    routes: ['login', 'dashboard', 'pos'].map((name) => ({ path: `/${name}`, name, component: { render: () => null } })),
  })
  const pinia = createPinia()
  setActivePinia(pinia)
  signedIn?.(useAuthStore())
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(PinLoginPage).use(pinia).use(router).use(i18n)
  app.mount(host)
  await settle()
}

const heading = () => host.querySelector('h1')?.textContent ?? ''
const appHeading = () => t('pos.signInTitle', { brand: t('app.brand') })

beforeEach(() => {
  localStorage.clear()
  server.brandingAsked = []
  server.tills = oneTill
})

afterEach(() => {
  app?.unmount()
  app = null
  host.remove()
  document.body.innerHTML = ''
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

// Com Mart's tills: two at Toul Kork, one at BKK1, one at Sen Sok.
const companyTills: PublicTill[] = [
  { deviceKey: 'TK-1', name: 'Till 1', branchId: 1, branchName: 'Toul Kork' },
  { deviceKey: 'TK-2', name: 'Till 2', branchId: 1, branchName: 'Toul Kork' },
  { deviceKey: 'BKK-1', name: 'Till 1', branchId: 2, branchName: 'BKK1' },
  { deviceKey: 'SS-1', name: 'Till 1', branchId: 3, branchName: 'Sen Sok' },
]

// Sok Dara sells at Toul Kork and BKK1 and only reads reports at Sen Sok,
// with `branch` selected in the back office.
function signedInAt(branch: number) {
  return (auth: ReturnType<typeof useAuthStore>) => {
    auth.activeBranchId = branch // as remembered from last time
    auth.applySession({
      user: { id: 2, full_name: 'Sok Dara', username: 'sok.dara', role_id: 1, role_name: 'Owner' },
      permissions: ['pos.sell'],
      branches: [
        { id: 1, name: 'Toul Kork', code: 'TK', permissions: ['pos.sell'] },
        { id: 2, name: 'BKK1', code: 'BKK1', permissions: ['pos.sell'] },
        { id: 3, name: 'Sen Sok', code: 'SS', permissions: ['reports.view'] },
      ],
      company: { id: 1, name: 'CM Shop', code: 'CM' },
      is_super_admin: false,
    })
  }
}

// A picker by its label: what it shows, and its options once opened.
function picker(label: string) {
  const wrapper = [...host.querySelectorAll<HTMLElement>('div.relative')].find((d) => d.querySelector('span')?.textContent?.trim() === label)
  return wrapper?.querySelector<HTMLButtonElement>(':scope > button') ?? null
}
const shown = (label: string) => picker(label)?.querySelector('.truncate')?.textContent?.trim()
async function options(label: string) {
  picker(label)!.click()
  await settle()
  const out = [...document.querySelectorAll<HTMLButtonElement>('[data-searchable-drop] button')].filter((b) => b.querySelector('.truncate'))
  return out
}
async function optionLabels(label: string) {
  const labels = (await options(label)).map((b) => b.textContent?.trim())
  picker(label)!.click() // closes it again
  await settle()
  return labels
}
async function choose(label: string, option: string) {
  const button = (await options(label)).find((b) => b.textContent?.trim() === option)
  expect(button, option).toBeDefined()
  button!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  await settle()
}
const openPos = () => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === t('pos.openPos')) as HTMLButtonElement

describe('choosing a till when signed in already', () => {
  beforeEach(() => {
    server.tills = companyTills
  })

  it("lists the selected branch's tills only, and makes the cashier choose among several", async () => {
    await mount(signedInAt(1))
    expect(await optionLabels(t('common.till'))).toEqual(['Till 1 · Toul Kork', 'Till 2 · Toul Kork'])
    expect(shown(t('common.till'))).toBe(t('pos.pickTill'))
    expect(openPos().disabled).toBe(true)
  })

  it("picks a branch's only till, and shows another branch's tills when the branch changes", async () => {
    await mount(signedInAt(2))
    expect(shown(t('common.branch'))).toBe('BKK1')
    expect(shown(t('common.till'))).toBe('Till 1 · BKK1')
    // Only the branches where this user may sell.
    expect(await optionLabels(t('common.branch'))).toEqual(['Toul Kork', 'BKK1'])

    await choose(t('common.branch'), 'Toul Kork')
    expect(useAuthStore().activeBranchId).toBe(1)
    expect(shown(t('common.till'))).toBe(t('pos.pickTill'))
    expect(await optionLabels(t('common.till'))).toEqual(['Till 1 · Toul Kork', 'Till 2 · Toul Kork'])
  })

  it('keeps the remembered till when it is at the selected branch', async () => {
    localStorage.setItem('com-mart-pos-device-key', 'TK-2')
    await mount(signedInAt(1))
    expect(shown(t('common.till'))).toBe('Till 2 · Toul Kork')
  })

  it('drops a remembered till at another branch', async () => {
    localStorage.setItem('com-mart-pos-device-key', 'TK-2')
    await mount(signedInAt(2))
    expect(shown(t('common.till'))).toBe('Till 1 · BKK1')
  })

  it('opens the POS on the chosen till and remembers its branch', async () => {
    await mount(signedInAt(1))
    await choose(t('common.till'), 'Till 2 · Toul Kork')
    openPos().click()
    await settle()
    const auth = useAuthStore()
    expect(router.currentRoute.value.name).toBe('pos')
    expect([auth.deviceKey, auth.tillName, auth.tillBranchId]).toEqual(['TK-2', 'Till 2 · Toul Kork', 1])
    expect(localStorage.getItem('com-mart-pos-till-branch')).toBe('1')
  })

  it('says when the selected branch has no till', async () => {
    server.tills = companyTills.filter((x) => x.branchId !== 1)
    await mount(signedInAt(1))
    expect(host.querySelector('[data-no-tills]')?.textContent?.trim()).toBe(t('pos.noTillsAtBranch', { branch: 'Toul Kork' }))
  })

  it("keeps a PIN sign-in at its till's branch", async () => {
    localStorage.setItem('com-mart-pos-via-pin-login', '1')
    await mount(signedInAt(2))
    expect(host.querySelector('[data-branch-picker]')).toBeNull()
    expect(host.querySelector('[data-branch-shown]')?.textContent).toContain('BKK1')
    expect(await optionLabels(t('common.till'))).toEqual(['Till 1 · BKK1'])
  })
})

describe('the PIN form', () => {
  beforeEach(() => {
    server.tills = companyTills
    localStorage.setItem(COMPANY_CODE_KEY, 'CM')
  })

  it("lists the company's tills and makes the cashier choose", async () => {
    await mount()
    expect(await optionLabels(t('common.till'))).toEqual(companyTills.map((x) => `${x.name} · ${x.branchName}`))
    expect(shown(t('common.till'))).toBe(t('pos.pickTill'))
  })

  it("keeps this till's remembered till", async () => {
    localStorage.setItem('com-mart-pos-device-key', 'SS-1')
    await mount()
    expect(shown(t('common.till'))).toBe('Till 1 · Sen Sok')
  })
})
