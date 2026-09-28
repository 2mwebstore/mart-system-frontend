import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from './tokens'
import type { ApiEnvelope } from './types'
import { useToast } from '@/composables/useToast'
import { apiErrorMessage } from '@/i18n/apiErrors'

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1'

export const apiClient = axios.create({ baseURL })

// Bare instance for the refresh call itself, so it never carries a stale
// Authorization header and never re-triggers the 401 interceptor below.
const refreshClient = axios.create({ baseURL })

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let isRefreshing = false
let pendingQueue: Array<() => void> = []

function onRefreshed() {
  pendingQueue.forEach((resolve) => resolve())
  pendingQueue = []
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiEnvelope<unknown>>) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
    const status = error.response?.status
    const isAuthRoute = originalRequest?.url?.includes('/auth/')

    if (status === 401 && originalRequest && !originalRequest._retry && !isAuthRoute) {
      const refreshToken = getRefreshToken()
      if (!refreshToken) {
        clearTokens()
        window.location.href = '/login'
        return Promise.reject(error)
      }

      originalRequest._retry = true

      if (!isRefreshing) {
        isRefreshing = true
        try {
          const { data } = await refreshClient.post<ApiEnvelope<{ access_token: string; refresh_token: string }>>(
            '/auth/refresh',
            { refresh_token: refreshToken },
          )
          setTokens(data.data.access_token, data.data.refresh_token)
        } catch (refreshError) {
          clearTokens()
          window.location.href = '/login'
          return Promise.reject(refreshError)
        } finally {
          isRefreshing = false
          onRefreshed()
        }
      }

      await new Promise<void>((resolve) => pendingQueue.push(resolve))
      return apiClient(originalRequest)
    }

    // Prefer the first field-level message (e.g. "That username is already
    // taken.") over the generic "One or more fields are invalid."
    const message = apiErrorMessage(error)
    const silent = (originalRequest as { silent?: boolean } | undefined)?.silent
    if (status !== 401 && !silent) {
      useToast().error(message)
    }
    return Promise.reject(error)
  },
)
