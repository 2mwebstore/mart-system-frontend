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
      { id: 7, name: 'Gotech', code: 'GT', active: true, maxBranches: null, maxUsers: 3, retentionMonths: 1 },
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
      },
    ])
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
