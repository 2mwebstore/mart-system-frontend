import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { i18n, t } from '@/i18n'
import type { Company } from '@/types/domain'
import CompaniesPage from './CompaniesPage.vue'

// The platform API, recording what the page sends.
const server = vi.hoisted(() => ({
  updates: [] as unknown[],
  creates: [] as unknown[],
  branchSwitches: [] as unknown[],
  userSwitches: [] as unknown[],
  cleared: [] as number[],
  // How the listed company starts its shifts.
  shiftMode: 'REQUIRED' as 'REQUIRED' | 'SKIP',
  // What the listed company sells in, and whether it has amounts in it yet.
  mainCurrency: 'USD' as 'USD' | 'KHR',
  mainCurrencyLocked: false,
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
  owners: [{ id: 70, fullName: 'Owner', username: 'gt.owner', active: true }],
  createdAt: '2026-11-01T00:00:00Z',
})
vi.mock('@/api/platform', () => ({
  listCompanies: async () => [company()],
  updateCompany: async (id: number, body: Record<string, unknown>) => {
    server.updates.push({ id, ...body })
    return { ...company(), ...body }
  },
  createCompany: async (body: Record<string, unknown>) => {
    server.creates.push(body)
    return { ...company(), id: 8, ...body }
  },
  clearCompanyActivityLog: async (id: number) => {
    server.cleared.push(id)
    return { deleted: 4 }
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

async function settle() {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r))
    await nextTick()
  }
}

async function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(CompaniesPage).use(i18n)
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
  server.updates = []
  server.creates = []
  server.branchSwitches = []
  server.userSwitches = []
  server.cleared = []
  server.shiftMode = 'REQUIRED'
  server.mainCurrency = 'USD'
  server.mainCurrencyLocked = false
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

  it('saves the limits, blank as no limit, and the retention', async () => {
    await mount()
    button(t('common.edit')).click()
    await settle()
    expect(field('edit-max-branches').value).toBe('5')
    expect(field('edit-max-users').value).toBe('')
    setValue('edit-max-branches', '')
    setValue('edit-max-users', '3')
    setValue('edit-retention', '1')
    await nextTick()
    // Fewer than it has on: it says nothing is switched off.
    expect(host.textContent).toContain(t('platform.limitBelowCount', { active: 4 }))
    host.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'))
    await settle()
    expect(server.updates).toEqual([
      { id: 7, name: 'Gotech', code: 'GT', active: true, maxBranches: null, maxUsers: 3, retentionMonths: 1, shiftMode: 'REQUIRED', mainCurrency: 'USD' },
    ])
  })

  // Save stays clickable: the browser points at the field and says why,
  // instead of a button that silently does nothing.
  it("won't save a limit below 1", async () => {
    await mount()
    button(t('common.edit')).click()
    await settle()
    setValue('edit-max-branches', '0')
    await nextTick()
    expect(button(t('common.save')).disabled).toBe(false)
    expect((field('edit-max-branches') as HTMLInputElement).checkValidity()).toBe(false)
    host.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'))
    await settle()
    expect(server.updates).toEqual([])
    setValue('edit-max-branches', '1')
    await nextTick()
    expect((field('edit-max-branches') as HTMLInputElement).checkValidity()).toBe(true)
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

  it('says why a new code is wrong when editing', async () => {
    await mount()
    button(t('common.edit')).click()
    await settle()
    setValue('edit-code', 'G-T')
    await nextTick()
    expect(host.querySelector('#edit-code-help')!.textContent?.trim()).toBe(t('platform.codeInvalid'))
    host.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'))
    await settle()
    expect(server.updates).toEqual([])
  })

  it('clears old log entries for that company', async () => {
    await mount()
    button(t('common.edit')).click()
    await settle()
    button(t('settings.retentionClearNow')).click()
    await settle()
    expect(server.cleared).toEqual([7])
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

  it("changes an empty company's currency, and shows it in the list", async () => {
    await mount()
    button(t('common.edit')).click()
    await settle()
    const form = host.querySelector<HTMLFormElement>('form')!
    expect(form.querySelector('[data-main-currency]')!.hasAttribute('disabled')).toBe(false)
    expect(form.querySelector('[data-main-currency-locked]')).toBeNull()
    form.querySelector<HTMLInputElement>('[data-main-currency-option="KHR"]')!.click()
    await nextTick()
    form.dispatchEvent(new Event('submit'))
    await settle()
    expect(server.updates).toEqual([expect.objectContaining({ id: 7, mainCurrency: 'KHR' })])
    expect(host.querySelector('[data-company-currency]')!.textContent!.trim()).toBe(t('platform.mainCurrencyShortKHR'))
  })

  it('locks the currency of a company with amounts in it, and says why', async () => {
    server.mainCurrency = 'KHR'
    server.mainCurrencyLocked = true
    await mount()
    button(t('common.edit')).click()
    await settle()
    const form = host.querySelector<HTMLFormElement>('form')!
    expect(form.querySelector('[data-main-currency]')!.hasAttribute('disabled')).toBe(true)
    expect(form.querySelector<HTMLInputElement>('[data-main-currency-option="KHR"]')!.checked).toBe(true)
    expect(form.querySelector('[data-main-currency-locked]')!.textContent!.trim()).toBe(t('platform.mainCurrencyLocked'))
    form.dispatchEvent(new Event('submit'))
    await settle()
    // It still saves the rest, with the currency as it was.
    expect(server.updates).toEqual([expect.objectContaining({ id: 7, mainCurrency: 'KHR' })])
  })

  it('shows how each company starts its shifts', async () => {
    await mount()
    expect(host.querySelector('[data-company-shift-mode]')!.textContent!.trim()).toBe(t('platform.shiftModeShortREQUIRED'))
  })

  it("starts the edit form from a company's own choice", async () => {
    server.shiftMode = 'SKIP'
    await mount()
    expect(host.querySelector('[data-company-shift-mode]')!.textContent!.trim()).toBe(t('platform.shiftModeShortSKIP'))
    button(t('common.edit')).click()
    await settle()
    const form = host.querySelector<HTMLFormElement>('form')!
    expect(form.querySelector<HTMLInputElement>('[data-shift-mode-option="SKIP"]')!.checked).toBe(true)
    form.dispatchEvent(new Event('submit'))
    await settle()
    expect(server.updates).toEqual([expect.objectContaining({ id: 7, shiftMode: 'SKIP' })])
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

  it("changes a company's shifts to skipped, and back", async () => {
    await mount()
    button(t('common.edit')).click()
    await settle()
    const form = () => host.querySelector<HTMLFormElement>('form')!
    expect(form().querySelector<HTMLInputElement>('[data-shift-mode-option="REQUIRED"]')!.checked).toBe(true)
    form().querySelector<HTMLInputElement>('[data-shift-mode-option="SKIP"]')!.click()
    await nextTick()
    form().dispatchEvent(new Event('submit'))
    await settle()
    expect(server.updates).toEqual([expect.objectContaining({ id: 7, shiftMode: 'SKIP' })])
    // The list shows what was saved.
    expect(host.querySelector('[data-company-shift-mode]')!.textContent!.trim()).toBe(t('platform.shiftModeShortSKIP'))

    // Opened again, the form starts from the company's choice.
    button(t('common.edit')).click()
    await settle()
    expect(form().querySelector<HTMLInputElement>('[data-shift-mode-option="SKIP"]')!.checked).toBe(true)
    form().querySelector<HTMLInputElement>('[data-shift-mode-option="REQUIRED"]')!.click()
    await nextTick()
    form().dispatchEvent(new Event('submit'))
    await settle()
    expect(server.updates[1]).toEqual(expect.objectContaining({ id: 7, shiftMode: 'REQUIRED' }))
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
