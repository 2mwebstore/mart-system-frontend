import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from './auth'

const branding = vi.hoisted(() => ({ shown: [] as string[] }))
vi.mock('./branding', () => ({ useBrandingStore: () => ({ useCompany: async (code: string) => void branding.shown.push(code) }) }))

// A Manager at branch 1 and a Cashier at branch 2, signed in with no branch
// named, so the session as a whole is their main role, Manager.
const session = () => ({
  user: { id: 5, full_name: 'Dara', username: 'dara', role_id: 2, role_name: 'Manager' },
  permissions: ['pos.sell', 'pos.discount', 'expense.create'],
  branches: [
    { id: 1, name: 'Toul Kork', code: 'TK', role_id: 2, role_name: 'Manager', permissions: ['pos.sell', 'pos.discount', 'expense.create'] },
    { id: 2, name: 'BKK1', code: 'BKK', role_id: 3, role_name: 'Cashier', permissions: ['pos.sell'] },
  ],
  company: null,
  is_super_admin: false,
})

beforeEach(() => {
  localStorage.clear()
  branding.shown = []
  setActivePinia(createPinia())
})

describe('the auth store and companies', () => {
  it("keeps the user's company and makes it this browser's", () => {
    const auth = useAuthStore()
    auth.applySession({ ...session(), company: { id: 4, name: 'Demo Two', code: 'D2' } })
    expect(auth.company?.code).toBe('D2')
    expect(auth.isSuperAdmin).toBe(false)
    expect(localStorage.getItem('com-mart-company-code')).toBe('D2')
    expect(branding.shown).toEqual(['D2'])
  })

  it('knows the super admin, who has no company', () => {
    localStorage.setItem('com-mart-company-code', 'CM')
    const auth = useAuthStore()
    auth.applySession({ ...session(), permissions: [], branches: [], company: null, is_super_admin: true })
    expect(auth.isSuperAdmin).toBe(true)
    expect(auth.company).toBeNull()
    expect(localStorage.getItem('com-mart-company-code')).toBe('CM')
    expect(branding.shown).toEqual([])
  })

  it('forgets both on sign-out', async () => {
    const auth = useAuthStore()
    auth.applySession({ ...session(), company: { id: 4, name: 'Demo Two', code: 'D2' } })
    await auth.logout()
    expect(auth.company).toBeNull()
    expect(auth.isSuperAdmin).toBe(false)
  })
})

describe('the auth store at each branch', () => {
  it('uses the role held at the active branch', () => {
    const auth = useAuthStore()
    auth.applySession(session())
    expect(auth.activeBranchId).toBe(1)
    expect(auth.hasPermission('expense.create')).toBe(true)
    expect(auth.user?.role_name).toBe('Manager')

    auth.setActiveBranch(2)
    expect(auth.hasPermission('expense.create')).toBe(false)
    expect(auth.hasPermission('pos.sell')).toBe(true)
    expect(auth.user?.role_name).toBe('Cashier')

    auth.setActiveBranch(1)
    expect(auth.hasPermission('expense.create')).toBe(true)
  })

  it('keeps the branch from last time, and its role', () => {
    localStorage.setItem('com-mart-active-branch', '2')
    const auth = useAuthStore()
    auth.applySession(session())
    expect(auth.activeBranchId).toBe(2)
    expect(auth.user?.role_name).toBe('Cashier')
    expect(auth.hasPermission('expense.create')).toBe(false)
  })

  it('leaves a till session with the role at the till', () => {
    const auth = useAuthStore()
    auth.viaPinLogin = true
    const atTill = { ...session(), user: { ...session().user, role_id: 3, role_name: 'Cashier' }, permissions: ['pos.sell'] }
    auth.applySession(atTill)
    auth.setActiveBranch(1)
    expect(auth.hasPermission('pos.discount')).toBe(false)
    expect(auth.user?.role_name).toBe('Cashier')
  })

  it('falls back to the session when the server gives no role per branch', () => {
    const auth = useAuthStore()
    const old = { ...session(), branches: session().branches.map(({ id, name, code }) => ({ id, name, code })) }
    auth.applySession(old)
    auth.setActiveBranch(2)
    expect(auth.hasPermission('expense.create')).toBe(true)
    expect(auth.user?.role_name).toBe('Manager')
  })
})
