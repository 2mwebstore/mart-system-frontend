import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { setTokens } from '@/api/tokens'
import router from './index'

const session = vi.hoisted(() => ({
  refused: false,
  superAdmin: false,
  permissions: ['pos.sell'] as string[],
  branches: [{ id: 1, name: 'Main', code: 'MAIN' }] as { id: number; name: string; code: string }[],
  shiftOpen: true,
}))

vi.mock('@/api/auth', () => ({
  fetchMe: vi.fn(async () => {
    if (session.refused) throw new Error('refused')
    if (session.superAdmin) {
      return {
        user: { id: 9, full_name: 'Root', username: 'root', role_id: 9, role_name: 'Super admin' },
        permissions: [],
        branches: [],
        company: null,
        is_super_admin: true,
      }
    }
    return {
      user: { id: 1, full_name: 'Test', username: 'test', role_id: 1, role_name: 'Staff' },
      permissions: session.permissions,
      branches: session.branches,
      company: { id: 3, name: 'Test Co', code: 'TC' },
      is_super_admin: false,
    }
  }),
}))
vi.mock('@/stores/branding', () => ({ useBrandingStore: () => ({ useCompany: async () => {} }) }))
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => ({ ensureLoaded: async () => {} }) }))
vi.mock('@/stores/shift', () => ({
  useShiftStore: () => ({
    refresh: async () => {},
    get isOpen() {
      return session.shiftOpen
    },
  }),
}))

// till: a till at the user's branch (Main), remembered with its branch;
// tillBranch: the branch remembered with it instead ('' for none).
function signIn({ viaPin = false, till = false, tillBranch = '1' } = {}) {
  setTokens('access', 'refresh')
  if (viaPin) localStorage.setItem('com-mart-pos-via-pin-login', '1')
  if (till) {
    localStorage.setItem('com-mart-pos-device-key', 'till-1')
    if (tillBranch) localStorage.setItem('com-mart-pos-till-branch', tillBranch)
  }
}

async function landsOn(path: string) {
  await router.push(path)
  return router.currentRoute.value.name
}

beforeEach(async () => {
  localStorage.clear()
  setActivePinia(createPinia())
  Object.assign(session, {
    refused: false,
    superAdmin: false,
    permissions: ['pos.sell'],
    branches: [{ id: 1, name: 'Main', code: 'MAIN' }],
    shiftOpen: true,
  })
  await router.push('/t/start')
})

describe('signed out', () => {
  it('sends the back office to the password sign-in', async () => {
    for (const path of ['/dashboard', '/users-roles', '/settings', '/print/invoice/1']) {
      await router.push('/t/start')
      expect(await landsOn(path)).toBe('login')
    }
  })

  it('sends the till to the PIN sign-in', async () => {
    expect(await landsOn('/pos')).toBe('pos-login')
  })

  it('leaves public pages open', async () => {
    expect(await landsOn('/login')).toBe('login')
    expect(await landsOn('/pos/login')).toBe('pos-login')
    expect(await landsOn('/t/some-table')).toBe('table-menu')
    expect(await landsOn('/pos/customer-display')).toBe('pos-customer-display')
  })
})

describe('a token the server refuses', () => {
  it('goes back to sign-in', async () => {
    signIn()
    session.refused = true
    expect(await landsOn('/dashboard')).toBe('login')
  })
})

describe('a PIN session', () => {
  it('asks for a password before the back office', async () => {
    signIn({ viaPin: true, till: true })
    for (const path of ['/dashboard', '/users-roles', '/settings', '/print/invoice/1']) {
      await router.push('/t/start')
      expect(await landsOn(path)).toBe('login')
    }
  })

  it('opens the till', async () => {
    signIn({ viaPin: true, till: true })
    expect(await landsOn('/pos')).toBe('pos')
  })

  it('picks a till first when none is set', async () => {
    signIn({ viaPin: true })
    expect(await landsOn('/pos')).toBe('pos-login')
  })

  it('opens a shift first when the till has none', async () => {
    signIn({ viaPin: true, till: true })
    session.shiftOpen = false
    expect(await landsOn('/pos')).toBe('pos-open-shift')
  })

  it("stays at its till whichever branch the browser had selected", async () => {
    session.branches = [
      { id: 1, name: 'Main', code: 'MAIN' },
      { id: 2, name: 'Riverside', code: 'RS' },
    ]
    localStorage.setItem('com-mart-active-branch', '1')
    signIn({ viaPin: true, till: true, tillBranch: '2' })
    expect(await landsOn('/pos')).toBe('pos')
  })
})

describe('a password session', () => {
  it('opens the back office', async () => {
    signIn()
    expect(await landsOn('/dashboard')).toBe('dashboard')
  })

  it('opens the till when the user can sell', async () => {
    signIn({ till: true })
    expect(await landsOn('/pos')).toBe('pos')
  })

  it("picks a till again when the remembered one is at another branch than the selected one", async () => {
    session.branches = [
      { id: 1, name: 'Main', code: 'MAIN' },
      { id: 2, name: 'Riverside', code: 'RS' },
    ]
    localStorage.setItem('com-mart-active-branch', '1')
    signIn({ till: true, tillBranch: '2' })
    for (const path of ['/pos', '/pos/open-shift', '/pos/close-shift']) {
      await router.push('/t/start')
      expect(await landsOn(path), path).toBe('pos-login')
    }
  })

  it("picks a till again when the remembered one's branch isn't known", async () => {
    signIn({ till: true, tillBranch: '' })
    expect(await landsOn('/pos')).toBe('pos-login')
  })

  it('does not open the till when the user cannot sell', async () => {
    signIn({ till: true })
    session.permissions = ['reports.view']
    expect(await landsOn('/pos')).toBe('pos-login')
  })

  it('goes to branch setup when there are no branches', async () => {
    signIn()
    session.branches = []
    expect(await landsOn('/dashboard')).toBe('settings-branches')
    // The rest of Settings stays open meanwhile.
    await router.push('/t/start')
    expect(await landsOn('/settings/company')).toBe('settings-company')
  })

  it('opens each part of a split page at its own address, and the old ones still lead there', async () => {
    signIn()
    const cases: [string, string][] = [
      ['/inventory/stock-moves', 'inventory-moves'],
      ['/inventory/customers', 'customers'],
      ['/inventory', 'inventory-products'],
      ['/inventory?tab=moves', 'inventory-moves'],
      ['/customers', 'customers'],
      ['/users-roles', 'users'],
      ['/users-roles?tab=roles', 'roles'],
      ['/settings', 'settings-rate'],
      ['/settings?tab=company', 'settings-company'],
      ['/settings?tab=nonsense', 'settings-rate'],
    ]
    for (const [path, name] of cases) {
      await router.push('/t/start')
      expect(await landsOn(path), path).toBe(name)
    }
  })

  it('never reaches the platform pages, an Owner neither', async () => {
    signIn()
    session.permissions = ['system.manage', 'system.reset', 'user.update']
    for (const path of ['/platform', '/platform/companies', '/platform/system']) {
      await router.push('/t/start')
      expect(await landsOn(path)).toBe('dashboard')
    }
  })

  it("remembers the user's company for this browser", async () => {
    signIn()
    await landsOn('/dashboard')
    expect(localStorage.getItem('com-mart-company-code')).toBe('TC')
  })
})

describe('the super admin', () => {
  it('lands on the companies', async () => {
    signIn()
    session.superAdmin = true
    expect(await landsOn('/platform')).toBe('platform-companies')
  })

  it('reaches the platform pages', async () => {
    signIn()
    session.superAdmin = true
    expect(await landsOn('/platform/system')).toBe('platform-system')
  })

  it('reaches no company page and no till', async () => {
    signIn({ till: true })
    session.superAdmin = true
    for (const path of ['/dashboard', '/users-roles', '/settings', '/print/invoice/1', '/pos', '/pos/open-shift']) {
      await router.push('/t/start')
      expect(await landsOn(path)).toBe('platform-companies')
    }
  })

  it("leaves the browser's company as it was", async () => {
    localStorage.setItem('com-mart-company-code', 'XY')
    signIn()
    session.superAdmin = true
    await landsOn('/platform')
    expect(localStorage.getItem('com-mart-company-code')).toBe('XY')
  })
})
