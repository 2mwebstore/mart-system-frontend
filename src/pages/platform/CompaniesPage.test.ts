import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { i18n, t } from '@/i18n'
import type { Company } from '@/types/domain'
import CompaniesPage from './CompaniesPage.vue'

// The platform API, recording what the page sends. Editing a company is a
// page of its own (CompanyEditPage.test.ts).
const server = vi.hoisted(() => ({
  creates: [] as unknown[],
  branchSwitches: [] as unknown[],
  userSwitches: [] as unknown[],
  // How the listed company starts its shifts.
  shiftMode: 'REQUIRED' as 'REQUIRED' | 'SKIP',
  // What the listed company sells in, and whether it has amounts in it yet.
  mainCurrency: 'USD' as 'USD' | 'KHR',
  mainCurrencyLocked: false,
  usesTables: true,
}))
const company = (): Company => ({
  id: 7,
  name: 'Gotech',
  code: 'GT',
  active: true,
  branchCount: 3,
  activeBranchCount: 2,
  maxBranches: 5,
  userCount: 4,
  activeUserCount: 4,
  maxUsers: null,
  retentionMonths: 2,
  shiftMode: server.shiftMode,
  mainCurrency: server.mainCurrency,
  mainCurrencyLocked: server.mainCurrencyLocked,
  usesTables: server.usesTables,
  owners: [{ id: 70, fullName: 'Owner', username: 'gt.owner', active: true }],
  createdAt: '2026-11-01T00:00:00Z',
})
vi.mock('@/api/platform', () => ({
  listCompanies: async () => [company()],
  createCompany: async (body: Record<string, unknown>) => {
    server.creates.push(body)
    return { ...company(), id: 8, ...body }
  },
  listCompanyBranches: async () => [
    { id: 1, code: 'HQ', name: 'Head office', active: true },
    { id: 2, code: 'RS', name: 'Riverside', active: false },
  ],
  setCompanyBranchActive: async (id: number, branchId: number, active: boolean) => {
    server.branchSwitches.push({ id, branchId, active })
    return { id: branchId, code: 'HQ', name: 'Head office', active }
  },
  listCompanyUsers: async () => [{ id: 70, fullName: 'Owner', username: 'gt.owner', roleName: 'Owner', active: true }],
  setCompanyUserActive: async (id: number, userId: number, active: boolean) => {
    server.userSwitches.push({ id, userId, active })
    return { id: userId, fullName: 'Owner', username: 'gt.owner', roleName: 'Owner', active }
  },
  setCompanyOwner: async () => company(),
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

async function mount() {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/platform/companies', name: 'platform-companies', component: CompaniesPage },
      { path: '/platform/companies/:id/edit', name: 'platform-company-edit', component: { render: () => h('p', { 'data-edit-page': '' }) } },
    ],
  })
  await router.push('/platform/companies')
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({ template: '<RouterView />' }).use(router).use(i18n)
  app.mount(host)
  await settle()
}

const button = (label: string) => {
  const found = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
  )
  if (!found) throw new Error(`no button "${label}"`)
  return found
}
const field = (id: string) => host.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)!
function setValue(id: string, value: string) {
  const el = field(id)
  el.value = value
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input'))
}

beforeEach(() => {
  server.creates = []
  server.branchSwitches = []
  server.userSwitches = []
  server.shiftMode = 'REQUIRED'
  server.mainCurrency = 'USD'
  server.mainCurrencyLocked = false
  server.usesTables = true
})

afterEach(() => {
  app?.unmount()
  app = null
  host.remove()
})

describe('CompaniesPage', () => {
  it('shows each company against its limits, and its log retention', async () => {
    await mount()
    const row = host.querySelector('tbody tr')!.textContent ?? ''
    expect(row).toContain('2 / 5')
    expect(row).toContain(t('platform.offCount', { n: 1 }))
    expect(row).toContain('4')
    expect(row).toContain(t('settings.retentionMonthsOption', { n: 2 }, 2))
  })

  // A code the server can't take used to leave Create greyed out with no
  // reason given, so a super admin couldn't tell why nothing happened.
  it.each(['MART-01', 'My Shop', 'C', 'SHOP_1', 'ម៉ាត'])('says why the code %s is wrong, and sends nothing', async (code) => {
    await mount()
    button(t('platform.newCompany')).click()
    await settle()
    setValue('company-name', 'Small shop')
    setValue('company-code', code)
    setValue('owner-name', 'Small owner')
    setValue('owner-username', 'small.owner')
    setValue('owner-password', 'long-enough')
    await nextTick()
    const help = host.querySelector('#company-code-help')!
    expect(help.textContent?.trim()).toBe(t('platform.codeInvalid'))
    expect(help.classList.contains('text-danger-strong')).toBe(true)
    expect(field('company-code').getAttribute('aria-invalid')).toBe('true')
    expect((field('company-code') as HTMLInputElement).checkValidity()).toBe(false)
    expect(button(t('platform.createCompany')).disabled).toBe(false)
    host.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'))
    await settle()
    expect(server.creates).toEqual([])
  })

  it('takes a code in lower case or with spaces round it', async () => {
    await mount()
    button(t('platform.newCompany')).click()
    await settle()
    for (const code of ['cc2', ' CC2 ', 'ABCDEFGHIJ12']) {
      setValue('company-code', code)
      await nextTick()
      expect((field('company-code') as HTMLInputElement).checkValidity()).toBe(true)
      expect(host.querySelector('#company-code-help')!.textContent?.trim()).toBe(t('platform.codeHint'))
    }
  })

  it('a new company starts with the limits given, or none', async () => {
    await mount()
    button(t('platform.newCompany')).click()
    await settle()
    setValue('company-name', 'Small shop')
    setValue('company-code', 'ss')
    setValue('create-max-branches', '1')
    setValue('owner-name', 'Small owner')
    setValue('owner-username', 'small.owner')
    setValue('owner-password', 'long-enough')
    await nextTick()
    host.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'))
    await settle()
    expect(server.creates).toEqual([
      {
        name: 'Small shop',
        code: 'SS',
        ownerFullName: 'Small owner',
        ownerUsername: 'small.owner',
        ownerPassword: 'long-enough',
        maxBranches: 1,
        maxUsers: null,
        shiftMode: 'REQUIRED',
        mainCurrency: 'USD',
        usesTables: true,
      },
    ])
  })

  it('shows what each company sells in', async () => {
    await mount()
    expect(host.querySelector('[data-company-currency]')!.textContent!.trim()).toBe(t('platform.mainCurrencyShortUSD'))
  })

  it('makes a company that sells in riel', async () => {
    await mount()
    button(t('platform.newCompany')).click()
    await settle()
    const form = host.querySelector<HTMLFormElement>('form')!
    expect(form.querySelector<HTMLInputElement>('[data-main-currency-option="USD"]')!.checked).toBe(true)
    setValue('company-name', 'Riel shop')
    setValue('company-code', 'rs')
    setValue('owner-name', 'Riel owner')
    setValue('owner-username', 'riel.owner')
    setValue('owner-password', 'long-enough')
    form.querySelector<HTMLInputElement>('[data-main-currency-option="KHR"]')!.click()
    await nextTick()
    form.dispatchEvent(new Event('submit'))
    await settle()
    expect(server.creates).toEqual([expect.objectContaining({ code: 'RS', mainCurrency: 'KHR' })])
  })

  it('shows how each company starts its shifts', async () => {
    await mount()
    expect(host.querySelector('[data-company-shift-mode]')!.textContent!.trim()).toBe(t('platform.shiftModeShortREQUIRED'))
  })

  it('shows a company that skips shifts as such', async () => {
    server.shiftMode = 'SKIP'
    await mount()
    expect(host.querySelector('[data-company-shift-mode]')!.textContent!.trim()).toBe(t('platform.shiftModeShortSKIP'))
  })

  it('makes a company that skips opening shifts', async () => {
    await mount()
    button(t('platform.newCompany')).click()
    await settle()
    const form = host.querySelector<HTMLFormElement>('form')!
    expect(form.querySelector<HTMLInputElement>('[data-shift-mode-option="REQUIRED"]')!.checked).toBe(true)
    setValue('company-name', 'Quick shop')
    setValue('company-code', 'qs')
    setValue('owner-name', 'Quick owner')
    setValue('owner-username', 'quick.owner')
    setValue('owner-password', 'long-enough')
    form.querySelector<HTMLInputElement>('[data-shift-mode-option="SKIP"]')!.click()
    await nextTick()
    form.dispatchEvent(new Event('submit'))
    await settle()
    expect(server.creates).toEqual([expect.objectContaining({ code: 'QS', shiftMode: 'SKIP' })])
  })

  it('shows whether each company uses tables', async () => {
    await mount()
    expect(host.querySelector('[data-company-tables]')!.textContent!.trim()).toBe(t('platform.tablesShortOn'))
    app?.unmount()
    host.remove()
    server.usesTables = false
    await mount()
    expect(host.querySelector('[data-company-tables]')!.textContent!.trim()).toBe(t('platform.tablesShortOff'))
  })

  it('makes a company without tables', async () => {
    await mount()
    button(t('platform.newCompany')).click()
    await settle()
    const form = host.querySelector<HTMLFormElement>('form')!
    expect(form.querySelector<HTMLInputElement>('[data-tables-option="on"]')!.checked).toBe(true)
    setValue('company-name', 'Shop without tables')
    setValue('company-code', 'nt')
    setValue('owner-name', 'Shop owner')
    setValue('owner-username', 'nt.owner')
    setValue('owner-password', 'long-enough')
    form.querySelector<HTMLInputElement>('[data-tables-option="off"]')!.click()
    await nextTick()
    form.dispatchEvent(new Event('submit'))
    await settle()
    expect(server.creates).toEqual([expect.objectContaining({ code: 'NT', usesTables: false })])
  })

  // No popup any more: the pencil is a link to the company's own page.
  it('opens a company on its own Edit page', async () => {
    await mount()
    const edit = host.querySelector<HTMLAnchorElement>('[data-edit-company]')!
    expect(edit.getAttribute('aria-label')).toBe(t('common.edit'))
    expect(edit.getAttribute('href')).toBe('/platform/companies/7/edit')
    edit.click()
    await settle()
    expect(router.currentRoute.value.name).toBe('platform-company-edit')
    expect(router.currentRoute.value.params.id).toBe('7')
    expect(host.querySelector('[data-edit-page]')).not.toBeNull()
  })

  it("switches a company's branches and accounts on and off", async () => {
    await mount()
    button(t('platform.partsButton')).click()
    await settle()
    const hq = button('Head office')
    expect(hq.getAttribute('aria-checked')).toBe('true')
    expect(button('Riverside').getAttribute('aria-checked')).toBe('false')
    hq.click()
    await settle()
    expect(server.branchSwitches).toEqual([{ id: 7, branchId: 1, active: false }])
    expect(button('Head office').getAttribute('aria-checked')).toBe('false')

    button('Owner').click()
    await settle()
    expect(server.userSwitches).toEqual([{ id: 7, userId: 70, active: false }])
  })
})
