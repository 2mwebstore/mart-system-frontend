import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { i18n, t } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import type { Role, StaffUser } from '@/types/domain'
import UserEditPage from './UserEditPage.vue'
import UsersRolesPage from './UsersRolesPage.vue'

// The people API, recording what the pages send.
const server = vi.hoisted(() => ({
  creates: [] as unknown[],
  updates: [] as unknown[],
  deletes: [] as number[],
  users: [] as unknown[],
}))
const role = (id: number, name: string): Role => ({
  id,
  name,
  description: '',
  branchId: null,
  isLocked: name === 'Owner',
  maxDiscountPercent: 0,
  refundWithoutApprovalCents: 0,
  permissions: [],
  userCount: 0,
})
const roles: Role[] = [role(1, 'Owner'), role(2, 'Manager'), role(3, 'Cashier')]
const staff = (over: Partial<StaffUser>): StaffUser => ({
  id: 20,
  fullName: 'Dara',
  username: 'dara',
  phone: '012',
  roleId: 3,
  roleName: 'Cashier',
  branchIds: [1],
  branchRoles: [],
  hasOtherBranches: false,
  active: true,
  lastActiveAt: null,
  ...over,
})
vi.mock('@/api/people', () => ({
  listRoles: async () => roles,
  listPermissions: async () => [],
  getUser: async (id: number) => (server.users as StaffUser[]).find((u) => u.id === id),
  pageUsers: async () => ({
    data: server.users,
    meta: { page: 1, perPage: 25, total: server.users.length, totalPages: 1 },
  }),
  createUser: async (body: unknown) => {
    server.creates.push(body)
    return body
  },
  updateUser: async (id: number, body: Record<string, unknown>) => {
    server.updates.push({ id, ...body })
    return body
  },
  deleteUser: async (id: number) => {
    server.deletes.push(id)
  },
  resetUserPin: async () => ({ pin: '0000' }),
}))

let app: App | null = null
let host: HTMLElement
let router: Router
let pinia: Pinia

async function settle() {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r))
    await nextTick()
  }
}

// Signed in as user 10 at branch 1, with these permissions.
function signIn(permissions: string[]) {
  pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.$patch({
    user: { id: 10, full_name: 'Me', username: 'me', role_id: 2, role_name: 'Manager' } as never,
    permissions,
    branches: [{ id: 1, code: 'TK', name: 'Toul Kork' }] as never,
    activeBranchId: 1,
  })
}

async function mount(path: string) {
  const blank = { render: () => null }
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/users', name: 'users', component: UsersRolesPage, meta: { page: 'users-roles', section: 'users' } },
      { path: '/roles', name: 'roles', component: blank, meta: { page: 'users-roles', section: 'roles' } },
      { path: '/users/new', name: 'user-new', component: UserEditPage },
      { path: '/users/:id/edit', name: 'user-edit', component: UserEditPage },
    ],
  })
  await router.push(path)
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({ template: '<RouterView />' }).use(pinia).use(router).use(i18n)
  app.mount(host)
  await settle()
}

const input = (id: string) => host.querySelector<HTMLInputElement>(`#${id}`)!
function type(id: string, value: string) {
  const el = input(id)
  el.value = value
  el.dispatchEvent(new Event('input'))
}
const buttonNamed = (name: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.getAttribute('aria-label') === name || b.textContent?.trim() === name)

beforeEach(() => {
  server.creates = []
  server.updates = []
  server.deletes = []
  server.users = [staff({}), staff({ id: 10, fullName: 'Me', username: 'me', roleId: 2, roleName: 'Manager' })]
})

afterEach(() => {
  app?.unmount()
  app = null
  host?.remove()
  document.body.innerHTML = ''
})

describe('the new-user page', () => {
  it('sends the new user and goes back to the list', async () => {
    signIn(['user.view', 'user.create', 'user.update', 'user.delete'])
    await mount('/users/new')
    expect(host.querySelector('h1')?.textContent).toBe(t('users.new'))

    type('user-full-name', 'Sokha')
    type('user-username', 'sokha')
    type('user-pin', '4321')
    host.querySelector('form')!.dispatchEvent(new Event('submit'))
    await settle()

    expect(server.creates).toHaveLength(1)
    expect(server.creates[0]).toMatchObject({ fullName: 'Sokha', username: 'sokha', roleId: 3, branchIds: [1], pin: '4321', active: true })
    expect(router.currentRoute.value.name).toBe('users')
  })
})

describe('the edit-user page', () => {
  it('loads the user, saves the change and goes back to the list', async () => {
    signIn(['user.view', 'user.update'])
    await mount('/users/20/edit')
    expect(host.querySelector('h1')?.textContent).toBe(t('users.editTitle', { name: 'Dara' }))
    expect(input('user-full-name').value).toBe('Dara')
    // A PIN is set by Reset PIN, never on the form.
    expect(host.querySelector('#user-pin')).toBeNull()

    type('user-full-name', 'Dara Sok')
    host.querySelector('form')!.dispatchEvent(new Event('submit'))
    await settle()

    expect(server.updates).toEqual([expect.objectContaining({ id: 20, fullName: 'Dara Sok', username: 'dara', roleId: 3, pin: undefined })])
    expect(router.currentRoute.value.name).toBe('users')
  })

  it('only shows someone who also works at other branches', async () => {
    server.users = [staff({ hasOtherBranches: true })]
    signIn(['user.view', 'user.update', 'user.delete'])
    await mount('/users/20/edit')

    expect(host.querySelector('fieldset')!.disabled).toBe(true)
    expect(host.querySelector('button[type="submit"]')).toBeNull()
    expect(buttonNamed(t('users.resetPin'))).toBeUndefined()
    expect(buttonNamed(t('confirmDelete.ariaNamed', { label: t('entity.user'), name: 'Dara' }))).toBeUndefined()
  })

  it('offers no Delete on yourself', async () => {
    signIn(['user.view', 'user.update', 'user.delete'])
    await mount('/users/10/edit')
    expect(buttonNamed(t('users.resetPin'))).toBeDefined()
    expect(buttonNamed(t('confirmDelete.ariaNamed', { label: t('entity.user'), name: 'Me' }))).toBeUndefined()
  })

  it('deletes and goes back to the list', async () => {
    signIn(['user.view', 'user.update', 'user.delete'])
    await mount('/users/20/edit')
    buttonNamed(t('confirmDelete.ariaNamed', { label: t('entity.user'), name: 'Dara' }))!.click()
    await settle()
    const confirm = [...document.body.querySelectorAll<HTMLButtonElement>('button')].filter((b) => b.textContent?.trim() === t('common.delete')).pop()
    confirm!.click()
    await settle()
    expect(server.deletes).toEqual([20])
    expect(router.currentRoute.value.name).toBe('users')
  })
})

describe('the Users list', () => {
  const row = (id: number) => host.querySelector<HTMLElement>(`[data-user-row="${id}"]`)!
  const action = (id: number, name: string) => row(id).querySelector<HTMLButtonElement>(`[data-action="${name}"]`)
  const trash = (id: number) => row(id).querySelector<HTMLButtonElement>('button[aria-label^="' + t('confirmDelete.aria', { label: t('entity.user') }) + '"]')

  it('gives each row Edit, Reset PIN and Delete, but no Delete on yourself', async () => {
    signIn(['user.view', 'user.create', 'user.update', 'user.delete'])
    await mount('/users')

    expect(action(20, 'open')!.getAttribute('aria-label')).toBe(t('users.editAria', { name: 'Dara' }))
    expect(action(20, 'reset-pin')).not.toBeNull()
    expect(trash(20)).not.toBeNull()

    expect(action(10, 'reset-pin')).not.toBeNull()
    expect(trash(10)).toBeNull()
    expect(row(10).textContent).toContain(`(${t('users.you')})`)
  })

  it('offers only View without the permissions to change users', async () => {
    signIn(['user.view'])
    await mount('/users')

    expect(action(20, 'open')!.getAttribute('aria-label')).toBe(t('users.viewAria', { name: 'Dara' }))
    expect(action(20, 'reset-pin')).toBeNull()
    expect(trash(20)).toBeNull()
    expect([...host.querySelectorAll('a')].some((a) => a.textContent?.includes(t('users.new')))).toBe(false)
  })

  it('offers only View on someone who also works at other branches', async () => {
    server.users = [staff({ hasOtherBranches: true })]
    signIn(['user.view', 'user.update', 'user.delete'])
    await mount('/users')

    expect(action(20, 'open')!.getAttribute('aria-label')).toBe(t('users.viewAria', { name: 'Dara' }))
    expect(action(20, 'reset-pin')).toBeNull()
    expect(trash(20)).toBeNull()
  })

  it('opens the user’s page from the row and from the icon', async () => {
    signIn(['user.view', 'user.update'])
    await mount('/users')

    action(20, 'open')!.click()
    await settle()
    expect(router.currentRoute.value.fullPath).toBe('/users/20/edit')

    await router.push('/users')
    await settle()
    row(10).querySelector('td')!.click()
    await settle()
    expect(router.currentRoute.value.fullPath).toBe('/users/10/edit')
  })
})
