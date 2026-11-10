import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios'
import axios from 'axios'
import { getAccessToken, getRefreshToken, setTokens } from './tokens'
import { ACTIVE_BRANCH_KEY, BRANCH_HEADER } from './activeBranch'

// Answers requests the way the server would, without a server: one current
// access token and one current refresh token.
type Server = { access: string; refresh: string; refreshCalls: number; refreshStatus: number | null }
let server: Server

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown) {
  const response = { data, status, statusText: '', headers: {}, config }
  if (status >= 200 && status < 300) return Promise.resolve(response)
  return Promise.reject(new axios.AxiosError('failed', undefined, config, null, response))
}

const fakeServer: AxiosAdapter = async (config) => {
  const url = config.url ?? ''
  if (url.endsWith('/auth/refresh')) {
    server.refreshCalls++
    if (server.refreshStatus) return respond(config, server.refreshStatus, {})
    if (JSON.parse(config.data).refresh_token !== server.refresh) return respond(config, 401, {})
    server.access = `access-${server.refreshCalls}`
    server.refresh = `refresh-${server.refreshCalls}`
    return respond(config, 200, { data: { access_token: server.access, refresh_token: server.refresh } })
  }
  if (url.endsWith('/auth/login')) return respond(config, 401, {})
  if (config.headers?.Authorization !== `Bearer ${server.access}`) return respond(config, 401, {})
  return respond(config, 200, { data: url })
}

let handle: AxiosAdapter = fakeServer

// The client makes its axios instances as it loads and they copy these defaults,
// so the fake server has to be in place first.
axios.defaults.adapter = (config) => handle(config)
const { apiClient } = await import('./client')

function stubLocation(path: string) {
  vi.stubGlobal('location', { href: `http://localhost${path}`, pathname: path })
}

beforeEach(() => {
  localStorage.clear()
  server = { access: 'current', refresh: 'refresh-0', refreshCalls: 0, refreshStatus: null }
  handle = fakeServer
  stubLocation('/dashboard')
})

describe('apiClient on a 401', () => {
  it('refreshes and retries the request, which then resolves', async () => {
    setTokens('expired', 'refresh-0')
    const answer = await apiClient.get('/users')
    expect(answer.data).toEqual({ data: '/users' })
    expect(server.refreshCalls).toBe(1)
    expect(getAccessToken()).toBe('access-1')
    expect(getRefreshToken()).toBe('refresh-1')
  })

  it('refreshes once for requests that fail together, and all of them resolve', async () => {
    setTokens('expired', 'refresh-0')
    const answers = await Promise.all([apiClient.get('/a'), apiClient.get('/b'), apiClient.get('/c')])
    expect(answers.map((a) => a.data.data)).toEqual(['/a', '/b', '/c'])
    expect(server.refreshCalls).toBe(1)
  })

  it('refreshes for /auth/me too', async () => {
    setTokens('expired', 'refresh-0')
    const answer = await apiClient.get('/auth/me')
    expect(answer.status).toBe(200)
    expect(server.refreshCalls).toBe(1)
  })

  it('does not refresh when a sign-in is refused', async () => {
    setTokens('expired', 'refresh-0')
    await expect(apiClient.post('/auth/login', {})).rejects.toBeTruthy()
    expect(server.refreshCalls).toBe(0)
    expect(getRefreshToken()).toBe('refresh-0')
    expect(window.location.href).toBe('http://localhost/dashboard')
  })

  it('signs out when the refresh token is refused', async () => {
    setTokens('expired', 'dead-token')
    await expect(apiClient.get('/users')).rejects.toBeTruthy()
    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
    expect(window.location.href).toBe('/login')
  })

  it('sends a till to the till sign-in', async () => {
    stubLocation('/pos')
    setTokens('expired', 'dead-token')
    await expect(apiClient.get('/sales')).rejects.toBeTruthy()
    expect(window.location.href).toBe('/pos/login')
  })

  it('signs out when there is no refresh token', async () => {
    await expect(apiClient.get('/users')).rejects.toBeTruthy()
    expect(server.refreshCalls).toBe(0)
    expect(window.location.href).toBe('/login')
  })

  it('stays signed in when another tab has just rotated the token', async () => {
    setTokens('expired', 'stale-from-this-tab')
    const otherTab = setTimeout(() => setTokens('current', 'refresh-0'), 50)
    const answer = await apiClient.get('/users')
    clearTimeout(otherTab)
    expect(answer.status).toBe(200)
    expect(getRefreshToken()).toBe('refresh-0')
    expect(window.location.href).toBe('http://localhost/dashboard')
  })

  it('stays signed in when the refresh fails for any other reason', async () => {
    setTokens('expired', 'refresh-0')
    for (const status of [500, 429, 503]) {
      server.refreshStatus = status
      await expect(apiClient.get('/users')).rejects.toBeTruthy()
    }
    expect(getRefreshToken()).toBe('refresh-0')
    expect(window.location.href).toBe('http://localhost/dashboard')
  })

  it('stays signed in when the connection drops during the refresh', async () => {
    setTokens('expired', 'refresh-0')
    handle = (config) => {
      if ((config.url ?? '').endsWith('/auth/refresh')) {
        return Promise.reject(new axios.AxiosError('Network Error', 'ERR_NETWORK', config))
      }
      return fakeServer(config)
    }
    await expect(apiClient.get('/users')).rejects.toBeTruthy()
    expect(getRefreshToken()).toBe('refresh-0')
    expect(window.location.href).toBe('http://localhost/dashboard')
  })

  it('does not loop when the retried request is refused again', async () => {
    setTokens('expired', 'refresh-0')
    let calls = 0
    handle = (config) => {
      if ((config.url ?? '').endsWith('/users')) {
        calls++
        return respond(config, 401, {})
      }
      return fakeServer(config)
    }
    await expect(apiClient.get('/users')).rejects.toBeTruthy()
    expect(calls).toBe(2)
    expect(server.refreshCalls).toBe(1)
  })
})

describe('apiClient requests', () => {
  it('sends the stored access token', async () => {
    setTokens('current', 'refresh-0')
    const answer = await apiClient.get('/users')
    expect(answer.config.headers.Authorization).toBe('Bearer current')
  })

  it('sends no Authorization header when signed out', async () => {
    const seen: unknown[] = []
    handle = (config) => {
      seen.push(config.headers.Authorization)
      return respond(config, 200, {})
    }
    await apiClient.get('/public/tables/abc/menu')
    expect(seen).toEqual([undefined])
  })

  // The server answers with the role the user holds at that branch.
  it('says which branch the app is working at', async () => {
    setTokens('current', 'refresh-0')
    localStorage.setItem(ACTIVE_BRANCH_KEY, '7')
    const answer = await apiClient.get('/users')
    expect(answer.config.headers[BRANCH_HEADER]).toBe('7')
  })

  it('names no branch when none is picked', async () => {
    setTokens('current', 'refresh-0')
    const answer = await apiClient.get('/users')
    expect(answer.config.headers[BRANCH_HEADER]).toBeUndefined()
  })

  it('names no branch to a signed-out page', async () => {
    localStorage.setItem(ACTIVE_BRANCH_KEY, '7')
    const seen: unknown[] = []
    handle = (config) => {
      seen.push(config.headers[BRANCH_HEADER])
      return respond(config, 200, {})
    }
    await apiClient.get('/public/tables/abc/menu')
    expect(seen).toEqual([undefined])
  })
})
