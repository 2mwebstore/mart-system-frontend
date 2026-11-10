import { apiClient } from './client'
import type { ApiEnvelope } from './types'

export interface BranchSummary {
  id: number
  name: string
  code: string
  // The role the user holds at this branch, and what it lets them do there.
  role_id?: number
  role_name?: string
  permissions?: string[]
}

export interface UserSummary {
  id: number
  full_name: string
  username: string
  role_id: number
  role_name: string
}

// The company the user works for. A super admin has none.
export interface CompanySummary {
  id: number
  name: string
  code: string
}

export interface AuthResponse {
  access_token: string
  refresh_token: string
  user: UserSummary
  permissions: string[]
  branches: BranchSummary[]
  company: CompanySummary | null
  is_super_admin: boolean
}

export interface MeResponse {
  user: UserSummary
  permissions: string[]
  branches: BranchSummary[]
  company: CompanySummary | null
  is_super_admin: boolean
}

export async function login(username: string, password: string) {
  const { data } = await apiClient.post<ApiEnvelope<AuthResponse>>('/auth/login', { username, password })
  return data.data
}

export async function pinLogin(companyCode: string, deviceKey: string, username: string, pin: string) {
  const { data } = await apiClient.post<ApiEnvelope<AuthResponse>>('/auth/pin-login', {
    company_code: companyCode,
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
