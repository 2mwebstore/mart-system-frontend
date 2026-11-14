import { onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'

// How often an open app re-reads its company's settings while it shows, and
// the least time between two re-reads on other cues (a page change, coming
// back to the tab).
export const RECHECK_MS = 30_000
export const MIN_GAP_MS = 5_000

// Keeps an open app's company settings current, so a change made elsewhere
// shows without signing out: the super admin turning a company's shifts off
// or on, say, reaches a till or back office already open. They're re-read
// every RECHECK_MS while the tab shows, when it shows again, and after a page
// change. Used once, by App.vue.
//
// A page that no longer applies is left: without shifts, the Shifts page goes
// to the Dashboard and the till's Open or Close shift page back to selling
// (where the till opens its shift by itself, see the router guard); without
// tables, Settings > Tables & QR and the QR sheet go to the Dashboard (the
// till drops its Tables view by itself).
export function useLiveSettings() {
  const auth = useAuthStore()
  const settings = useSettingsStore()
  const router = useRouter()

  async function recheck(force = false) {
    // Only for someone in a company, once the settings were first read.
    if (!settings.loaded || !auth.isAuthenticated || auth.isSuperAdmin) return
    if (document.visibilityState === 'hidden') return
    if (!force && Date.now() - settings.appReadAt < MIN_GAP_MS) return
    try {
      await settings.refreshAppSettings()
    } catch {
      // offline or a server hiccup: the next re-check tries again
    }
  }

  watch(
    () => settings.usesShifts,
    (uses) => {
      if (uses) return
      const at = router.currentRoute.value.name
      if (at === 'shifts') void router.replace({ name: 'dashboard' })
      else if (at === 'pos-open-shift' || at === 'pos-close-shift') void router.replace({ name: 'pos' })
    },
  )
  watch(
    () => settings.usesTables,
    (uses) => {
      if (uses) return
      const at = router.currentRoute.value.name
      if (at === 'settings-tables' || at === 'table-qr-print') void router.replace({ name: 'dashboard' })
    },
  )

  const onShow = () => void recheck()
  let timer: ReturnType<typeof setInterval> | undefined
  let stopAfterEach: (() => void) | undefined
  onMounted(() => {
    timer = setInterval(() => void recheck(true), RECHECK_MS)
    document.addEventListener('visibilitychange', onShow)
    window.addEventListener('focus', onShow)
    stopAfterEach = router.afterEach(() => void recheck())
  })
  onUnmounted(() => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onShow)
    window.removeEventListener('focus', onShow)
    stopAfterEach?.()
  })
}
