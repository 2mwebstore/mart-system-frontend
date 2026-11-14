import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { i18n, t } from '@/i18n'
import type { Company } from '@/types/domain'
import CompanyEditPage from './CompanyEditPage.vue'

// The platform API, recording what the page sends.
const server = vi.hoisted(() => ({
  updates: [] as unknown[],
  cleared: [] as number[],
  fails: false,
  shiftMode: 'REQUIRED' as 'REQUIRED' | 'SKIP',
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
  getCompany: async (id: number) => {
    if (server.fails || id !== 7) throw new Error('not found')
    return company()
  },
  updateCompany: async (id: number, body: Record<string, unknown>) => {
    server.updates.push({ id, ...body })
    return { ...company(), ...body }
  },
  clearCompanyActivityLog: async (id: number) => {
    server.cleared.push(id)
    return { deleted: 4 }
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

async function mount(id = 7) {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/platform/companies', name: 'platform-companies', component: { render: () => h('p', { 'data-company-list': '' }) } },
      { path: '/platform/companies/:id/edit', name: 'platform-company-edit', component: CompanyEditPage },
    ],
  })
  await router.push(`/platform/companies/${id}/edit`)
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
const form = () => host.querySelector<HTMLFormElement>('[data-company-form]')!
async function submit() {
  form().dispatchEvent(new Event('submit'))
  await settle()
}
const option = (attr: string, value: string) => form().querySelector<HTMLInputElement>(`[${attr}="${value}"]`)!

beforeEach(() => {
  server.updates = []
  server.cleared = []
  server.fails = false
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

describe('the Edit company page', () => {
  it('opens as a page of its own, with the company as it is', async () => {
    await mount()
    expect(host.querySelector('h1')!.textContent).toBe(t('platform.editCompanyTitle', { name: 'Gotech' }))
    expect(host.querySelector('[data-back-to-companies]')!.getAttribute('href')).toBe('/platform/companies')
    expect(field('edit-name').value).toBe('Gotech')
    expect(field('edit-code').value).toBe('GT')
    expect(host.querySelector('[data-company-active]')!.getAttribute('aria-checked')).toBe('true')
    expect(field('edit-max-branches').value).toBe('5')
    expect(field('edit-max-users').value).toBe('')
    expect(field('edit-retention').value).toBe('2')
    expect(option('data-shift-mode-option', 'REQUIRED').checked).toBe(true)
    expect(option('data-main-currency-option', 'USD').checked).toBe(true)
    expect(option('data-tables-option', 'on').checked).toBe(true)
  })

  it('saves the limits, blank as no limit, and the retention, and goes back to the list', async () => {
    await mount()
    setValue('edit-max-branches', '')
    setValue('edit-max-users', '3')
    setValue('edit-retention', '1')
    await nextTick()
    // Fewer than it has on: it says nothing is switched off.
    expect(host.textContent).toContain(t('platform.limitBelowCount', { active: 4 }))
    await submit()
    expect(server.updates).toEqual([
      {
        id: 7,
        name: 'Gotech',
        code: 'GT',
        active: true,
        maxBranches: null,
        maxUsers: 3,
        retentionMonths: 1,
        shiftMode: 'REQUIRED',
        mainCurrency: 'USD',
        usesTables: true,
      },
    ])
    expect(router.currentRoute.value.name).toBe('platform-companies')
  })

  // Save stays clickable: the browser points at the field and says why,
  // instead of a button that silently does nothing.
  it("won't save a limit below 1", async () => {
    await mount()
    setValue('edit-max-branches', '0')
    await nextTick()
    expect(button(t('common.save')).disabled).toBe(false)
    expect((field('edit-max-branches') as HTMLInputElement).checkValidity()).toBe(false)
    await submit()
    expect(server.updates).toEqual([])
    expect(router.currentRoute.value.name).toBe('platform-company-edit')
    setValue('edit-max-branches', '1')
    await nextTick()
    expect((field('edit-max-branches') as HTMLInputElement).checkValidity()).toBe(true)
  })

  it('says why a new code is wrong, and sends nothing', async () => {
    await mount()
    setValue('edit-code', 'G-T')
    await nextTick()
    expect(host.querySelector('#edit-code-help')!.textContent?.trim()).toBe(t('platform.codeInvalid'))
    await submit()
    expect(server.updates).toEqual([])
  })

  it('warns that switching a company off signs its people out', async () => {
    await mount()
    expect(host.textContent).not.toContain(t('platform.disableWarning'))
    ;(host.querySelector('[data-company-active]') as HTMLButtonElement).click()
    await nextTick()
    expect(host.textContent).toContain(t('platform.disableWarning'))
    await submit()
    expect(server.updates).toEqual([expect.objectContaining({ id: 7, active: false })])
  })

  it('clears old log entries for that company, and stays on the page', async () => {
    await mount()
    button(t('settings.retentionClearNow')).click()
    await settle()
    expect(server.cleared).toEqual([7])
    expect(server.updates).toEqual([])
    expect(router.currentRoute.value.name).toBe('platform-company-edit')
  })

  it("changes an empty company's currency", async () => {
    await mount()
    expect(form().querySelector('[data-main-currency]')!.hasAttribute('disabled')).toBe(false)
    expect(form().querySelector('[data-main-currency-locked]')).toBeNull()
    option('data-main-currency-option', 'KHR').click()
    await nextTick()
    await submit()
    expect(server.updates).toEqual([expect.objectContaining({ id: 7, mainCurrency: 'KHR' })])
  })

  it('locks the currency of a company with amounts in it, and says why', async () => {
    server.mainCurrency = 'KHR'
    server.mainCurrencyLocked = true
    await mount()
    expect(form().querySelector('[data-main-currency]')!.hasAttribute('disabled')).toBe(true)
    expect(option('data-main-currency-option', 'KHR').checked).toBe(true)
    expect(form().querySelector('[data-main-currency-locked]')!.textContent!.trim()).toBe(t('platform.mainCurrencyLocked'))
    await submit()
    // It still saves the rest, with the currency as it was.
    expect(server.updates).toEqual([expect.objectContaining({ id: 7, mainCurrency: 'KHR' })])
  })

  it("starts from the company's own shifts, and changes them", async () => {
    server.shiftMode = 'SKIP'
    await mount()
    expect(option('data-shift-mode-option', 'SKIP').checked).toBe(true)
    option('data-shift-mode-option', 'REQUIRED').click()
    await nextTick()
    await submit()
    expect(server.updates).toEqual([expect.objectContaining({ id: 7, shiftMode: 'REQUIRED' })])
  })

  it('turns tables off for a company', async () => {
    await mount()
    expect(form().querySelector('[data-tables]')!.textContent).toContain(t('platform.tablesOffHint'))
    option('data-tables-option', 'off').click()
    await nextTick()
    await submit()
    expect(server.updates).toEqual([expect.objectContaining({ id: 7, usesTables: false })])
  })

  it('starts from tables off, and turns them back on', async () => {
    server.usesTables = false
    await mount()
    expect(option('data-tables-option', 'off').checked).toBe(true)
    option('data-tables-option', 'on').click()
    await nextTick()
    await submit()
    expect(server.updates).toEqual([expect.objectContaining({ id: 7, usesTables: true })])
  })

  it('goes back without sending anything on Cancel', async () => {
    await mount()
    setValue('edit-name', 'Changed')
    button(t('common.cancel')).click()
    await settle()
    expect(router.currentRoute.value.name).toBe('platform-companies')
    expect(server.updates).toEqual([])
  })

  it("says so when the company can't be loaded", async () => {
    server.fails = true
    await mount()
    expect(host.textContent).toContain(t('platform.companyLoadFailed'))
    expect(host.querySelector('[data-company-form]')).toBeNull()
    button(t('platform.backToCompanies')).click()
    await settle()
    expect(router.currentRoute.value.name).toBe('platform-companies')
  })
})
