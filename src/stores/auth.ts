import { defineStore } from 'pinia'
import * as authApi from '@/api/auth'
import { clearTokens, getRefreshToken, setTokens } from '@/api/tokens'

interface AuthState {
  user: authApi.UserSummary | null
  permissions: string[]
  branches: authApi.BranchSummary[]
  activeBranchId: number | null
  deviceKey: string
  tillName: string
  viaPinLogin: boolean
}

const ACTIVE_BRANCH_KEY = 'com-mart-active-branch'
// The POS screen's till identity — set on PIN sign-in, kept across sessions
// like activeBranchId (a kiosk stays pointed at the same till; only the
// signed-in cashier changes).
const DEVICE_KEY_STORAGE = 'com-mart-pos-device-key'
const TILL_NAME_STORAGE = 'com-mart-pos-till-name'
// Admin and POS share one token store now that they're one project/origin,
// but a valid admin session must never silently double as a till session —
// the person standing at the till still has to type their own PIN, even if
// someone's already signed into the back office in another tab on this same
// machine. This flag tracks which flow produced the *current* session, and
// is what the router's POS guard checks (see router/index.ts) — persisted
// so it survives a reload mid-shift, cleared by a password login or logout.
const VIA_PIN_LOGIN_KEY = 'com-mart-pos-via-pin-login'

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    permissions: [],
    branches: [],
    activeBranchId: Number(localStorage.getItem(ACTIVE_BRANCH_KEY)) || null,
    deviceKey: localStorage.getItem(DEVICE_KEY_STORAGE) ?? '',
    tillName: localStorage.getItem(TILL_NAME_STORAGE) ?? '',
    viaPinLogin: localStorage.getItem(VIA_PIN_LOGIN_KEY) === '1',
  }),

  getters: {
    isAuthenticated: (state) => state.user !== null,
    hasPermission: (state) => (key: string) => state.permissions.includes(key),
  },

  actions: {
    applySession(session: { user: authApi.UserSummary; permissions: string[]; branches: authApi.BranchSummary[] }) {
      this.user = session.user
      this.permissions = session.permissions
      this.branches = session.branches
      // activeBranchId persists across logout/login on purpose (so the same
      // admin coming back sees the same branch), but it's only ever trusted
      // once here, against this fresh session's real branch list — a branch
      // that was deleted (most drastically: every branch, by a production
      // reset) would otherwise keep being sent on every request forever,
      // 403ing against BranchScope with the same generic message a real
      // permission problem gives, since the cached id is never re-checked
      // against what the caller can actually access any other way.
      const stillValid = this.activeBranchId !== null && session.branches.some((b) => b.id === this.activeBranchId)
      if (!stillValid) {
        if (session.branches.length > 0) {
          this.setActiveBranch(session.branches[0].id)
        } else {
          this.activeBranchId = null
          localStorage.removeItem(ACTIVE_BRANCH_KEY)
        }
      }
    },

    setActiveBranch(branchId: number) {
      this.activeBranchId = branchId
      localStorage.setItem(ACTIVE_BRANCH_KEY, String(branchId))
    },

    async login(username: string, password: string) {
      const result = await authApi.login(username, password)
      setTokens(result.access_token, result.refresh_token)
      this.applySession(result)
      this.viaPinLogin = false
      localStorage.removeItem(VIA_PIN_LOGIN_KEY)
    },

    async pinLogin(deviceKey: string, tillName: string, username: string, pin: string) {
      const result = await authApi.pinLogin(deviceKey, username, pin)
      setTokens(result.access_token, result.refresh_token)
      this.applySession(result)
      this.deviceKey = deviceKey
      this.tillName = tillName
      this.viaPinLogin = true
      localStorage.setItem(DEVICE_KEY_STORAGE, deviceKey)
      localStorage.setItem(TILL_NAME_STORAGE, tillName)
      localStorage.setItem(VIA_PIN_LOGIN_KEY, '1')
    },

    async fetchMe() {
      const result = await authApi.fetchMe()
      this.applySession(result)
    },

    async logout() {
      const refreshToken = getRefreshToken()
      try {
        if (refreshToken) await authApi.logout(refreshToken)
      } finally {
        clearTokens()
        localStorage.removeItem(VIA_PIN_LOGIN_KEY)
        this.$reset()
      }
    },
  },
})
