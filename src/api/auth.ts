import { apiClient } from './client'
import type { ApiEnvelope } from './types'

export interface BranchSummary {
  id: number
  name: string
  code: string
}

export interface UserSummary {
  id: number
  full_name: string
  username: string
  role_id: number
  role_name: string
}

export interface AuthResponse {
  access_token: string
  refresh_token: string
  user: UserSummary
  permissions: string[]
  branches: BranchSummary[]
}

export interface MeResponse {
  user: UserSummary
  permissions: string[]
  branches: BranchSummary[]
}

export async function login(username: string, password: string) {
  const { data } = await apiClient.post<ApiEnvelope<AuthResponse>>('/auth/login', { username, password })
  return data.data
}

export async function pinLogin(deviceKey: string, username: string, pin: string) {
  const { data } = await apiClient.post<ApiEnvelope<AuthResponse>>('/auth/pin-login', {
    device_key: deviceKey,
    username,
    pin,
  })
  return data.data
}

export async function logout(refreshToken: string) {
  await apiClient.post('/auth/logout', { refresh_token: refreshToken })
}

export async function fetchMe() {
  const { data } = await apiClient.get<ApiEnvelope<MeResponse>>('/auth/me')
  return data.data
}
