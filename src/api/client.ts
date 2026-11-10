import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from './tokens'
import { BRANCH_HEADER, storedActiveBranch } from './activeBranch'
import type { ApiEnvelope } from './types'
import { useToast } from '@/composables/useToast'
import { apiErrorMessage } from '@/i18n/apiErrors'

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1'
// For URLs the browser loads itself (the company logo as an <img>).
export const apiBaseURL = baseURL

export const apiClient = axios.create({ baseURL })

// Bare instance for the refresh call itself, so it never carries a stale
// Authorization header and never re-triggers the 401 interceptor below.
const refreshClient = axios.create({ baseURL })

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${token}`
    // A till session ignores it: the server keeps that one at the till's branch.
    const branch = storedActiveBranch()
    if (branch) config.headers[BRANCH_HEADER] = String(branch)
  }
  return config
})

// Their 401 means a wrong password or a dead session, which a refresh can't fix.
// Any other 401, /auth/me included, is an access token that needs renewing.
const SESSION_ROUTE = /\/auth\/(login|pin-login|refresh|logout)$/

// How long to give another tab to finish storing the tokens it just received.
const TAB_RACE_WAIT_MS = 500

let refreshing: Promise<void> | null = null

async function refreshSession(usedToken: string): Promise<void> {
  try {
    const { data } = await refreshClient.post<ApiEnvelope<{ access_token: string; refresh_token: string }>>(
      '/auth/refresh',
      { refresh_token: usedToken },
    )
    setTokens(data.data.access_token, data.data.refresh_token)
  } catch (err) {
    // Another tab may have rotated the token we just sent, which is why the
    // server refused it. Its tokens are good, so use them instead of signing out.
    if ((err as AxiosError).response?.status === 401) {
      await new Promise((resolve) => setTimeout(resolve, TAB_RACE_WAIT_MS))
      const stored = getRefreshToken()
      if (stored && stored !== usedToken) return
    }
    throw err
  }
}

// Every request that hits a 401 at the same moment waits on this one refresh.
function sharedRefresh(usedToken: string): Promise<void> {
  refreshing ??= refreshSession(usedToken).finally(() => {
    refreshing = null
  })
  return refreshing
}

function goToSignIn() {
  clearTokens()
  window.location.href = window.location.pathname.startsWith('/pos') ? '/pos/login' : '/login'
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiEnvelope<unknown>>) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
    const status = error.response?.status
    const silent = (originalRequest as { silent?: boolean } | undefined)?.silent

    if (status === 401 && originalRequest && !originalRequest._retry && !SESSION_ROUTE.test(originalRequest.url ?? '')) {
      const refreshToken = getRefreshToken()
      if (!refreshToken) {
        goToSignIn()
        return Promise.reject(error)
      }

      originalRequest._retry = true
      try {
        await sharedRefresh(refreshToken)
      } catch (refreshError) {
        // Only a refused token ends the session. A dropped connection or a
        // server error says nothing about it, so the till stays signed in.
        if ((refreshError as AxiosError).response?.status === 401) goToSignIn()
        else if (!silent) useToast().error(apiErrorMessage(refreshError))
        return Promise.reject(refreshError)
      }
      return apiClient(originalRequest)
    }

    // Prefer the first field-level message (e.g. "That username is already
    // taken.") over the generic "One or more fields are invalid."
    const message = apiErrorMessage(error)
    if (status !== 401 && !silent) {
      useToast().error(message)
    }
    return Promise.reject(error)
  },
)
