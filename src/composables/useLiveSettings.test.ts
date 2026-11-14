import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import type { UserSummary } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { MIN_GAP_MS, RECHECK_MS, useLiveSettings } from './useLiveSettings'

// The company's settings on the server, as the super admin last left them;
// reads counts each re-read, quiet whether it asked for no error toast.
const server = vi.hoisted(() => ({ shiftMode: 'REQUIRED' as 'REQUIRED' | 'SKIP', usesTables: true, reads: 0, quiet: [] as boolean[], fail: false }))
vi.mock('@/api/settings', () => ({
  getSettings: async (opts?: { silent?: boolean }) => {
    server.reads++
    server.quiet.push(opts?.silent === true)
    if (server.fail) throw new Error('offline')
    return { ...useSettingsStore().app, shiftMode: server.shiftMode, usesTables: server.usesTables }
  },
}))

const pages = ['dashboard', 'shifts', 'pos', 'pos-open-shift', 'pos-close-shift', 'settings-tables', 'table-qr-print', 'settings-rate']
let app: App | null = null
let router: Router

async function settle() {
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r))
    await nextTick()
  }
}

// An app open at a page, its settings read at sign-in with this shift mode.
async function openAt(page: string, { mode = 'REQUIRED' as 'REQUIRED' | 'SKIP', superAdmin = false, signedIn = true } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  if (signedIn) useAuthStore().$patch({ user: { id: 1, full_name: 'Dara' } as UserSummary, isSuperAdmin: superAdmin })
  const settings = useSettingsStore()
  settings.$patch({ loaded: true, appReadAt: Date.now(), app: { ...settings.app, shiftMode: mode } })
  server.shiftMode = mode
  server.usesTables = true
  router = createRouter({ history: createMemoryHistory(), routes: pages.map((name) => ({ path: `/${name}`, name, component: { render: () => null } })) })
  await router.push(`/${page}`)
  app = createApp({ setup: () => (useLiveSettings(), () => null) }).use(pinia).use(router)
  app.mount(document.createElement('div'))
}
const at = () => router.currentRoute.value.name
async function wait(ms: number) {
  vi.advanceTimersByTime(ms)
  await settle()
}
async function showTab() {
  document.dispatchEvent(new Event('visibilitychange'))
  await settle()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
  server.reads = 0
  server.quiet = []
  server.fail = false
})
afterEach(() => {
  app?.unmount()
  app = null
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('an open app re-reading its settings', () => {
  it('re-reads them every 30 seconds, quietly', async () => {
    await openAt('dashboard')
    await wait(RECHECK_MS - 1)
    expect(server.reads).toBe(0)
    await wait(1)
    expect(server.reads).toBe(1)
    expect(server.quiet).toEqual([true])
    await wait(RECHECK_MS)
    expect(server.reads).toBe(2)
  })

  it('re-reads them when the tab shows again or the page changes, not twice in a row', async () => {
    await openAt('dashboard')
    await showTab()
    expect(server.reads).toBe(0) // just read at sign-in
    await wait(MIN_GAP_MS)
    await showTab()
    expect(server.reads).toBe(1)
    await showTab()
    expect(server.reads).toBe(1)
    await wait(MIN_GAP_MS)
    await router.push('/pos')
    await settle()
    expect(server.reads).toBe(2)
  })

  it("doesn't while the tab is hidden, for the super admin or when signed out", async () => {
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await openAt('dashboard')
    await wait(RECHECK_MS)
    expect(server.reads).toBe(0)
    hidden.mockRestore()
    app!.unmount()

    await openAt('dashboard', { superAdmin: true })
    await wait(RECHECK_MS)
    app!.unmount()
    await openAt('dashboard', { signedIn: false })
    await wait(RECHECK_MS)
    expect(server.reads).toBe(0)
  })

  it('keeps what it had when a re-read fails', async () => {
    await openAt('pos', { mode: 'SKIP' })
    server.fail = true
    await wait(RECHECK_MS)
    expect(server.reads).toBe(1)
    expect(useSettingsStore().usesShifts).toBe(false)
  })
})

describe('shifts turned off or on while the app is open', () => {
  it('leaves the Shifts page for the Dashboard', async () => {
    await openAt('shifts')
    server.shiftMode = 'SKIP'
    await wait(RECHECK_MS)
    expect(useSettingsStore().usesShifts).toBe(false)
    expect(at()).toBe('dashboard')
  })

  it("leaves the till's Open and Close shift pages for selling", async () => {
    for (const page of ['pos-open-shift', 'pos-close-shift']) {
      await openAt(page)
      server.shiftMode = 'SKIP'
      await wait(RECHECK_MS)
      expect(at()).toBe('pos')
      app!.unmount()
      app = null
    }
  })

  it('stays where it is when shifts are turned on', async () => {
    // A till without shifts that couldn't open one by itself is left at the
    // Open shift page; with shifts back on, that's where it should be.
    await openAt('pos-open-shift', { mode: 'SKIP' })
    server.shiftMode = 'REQUIRED'
    await wait(RECHECK_MS)
    expect(useSettingsStore().usesShifts).toBe(true)
    expect(at()).toBe('pos-open-shift')
  })
})

describe('tables turned off or on while the app is open', () => {
  it('leaves Settings > Tables & QR and the QR sheet for the Dashboard', async () => {
    for (const page of ['settings-tables', 'table-qr-print']) {
      await openAt(page)
      server.usesTables = false
      await wait(RECHECK_MS)
      expect(useSettingsStore().usesTables).toBe(false)
      expect(at()).toBe('dashboard')
      app!.unmount()
      app = null
    }
  })

  it('stays on any other page', async () => {
    for (const page of ['settings-rate', 'pos']) {
      await openAt(page)
      server.usesTables = false
      await wait(RECHECK_MS)
      expect(at()).toBe(page)
      app!.unmount()
      app = null
    }
  })
})
