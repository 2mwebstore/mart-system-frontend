// The super admin's platform: the companies, and the tools that cover every
// company at once (backups, their alerts, the production reset). A company's
// own staff, its Owner included, get 403 on all of these.
import { del, downloadFile, get, post, put } from './http'
import type { BackupRow, BackupSettings, Company, CompanyBranch, CompanyUser, NotifySettings } from '@/types/domain'

// A limit of null is no limit.
export interface CompanyLimits {
  maxBranches: number | null
  maxUsers: number | null
}

export const listCompanies = () => get<Company[]>('/platform/companies')
export const createCompany = (
  c: { name: string; code: string; ownerFullName: string; ownerUsername: string; ownerPassword: string } & CompanyLimits,
) => post<Company>('/platform/companies', c)
// Every field is the new value.
export const updateCompany = (id: number, c: { name: string; code: string; active: boolean; retentionMonths: number } & CompanyLimits) =>
  put<Company>(`/platform/companies/${id}`, c)
// Purges the company's activity log entries older than its retention, now.
export const clearCompanyActivityLog = (id: number) => post<{ deleted: number }>(`/platform/companies/${id}/activity-log/clear`)

export const listCompanyBranches = (id: number) => get<CompanyBranch[]>(`/platform/companies/${id}/branches`)
export const setCompanyBranchActive = (id: number, branchId: number, active: boolean) =>
  put<CompanyBranch>(`/platform/companies/${id}/branches/${branchId}`, { active })
export const listCompanyUsers = (id: number) => get<CompanyUser[]>(`/platform/companies/${id}/users`)
export const setCompanyUserActive = (id: number, userId: number, active: boolean) =>
  put<CompanyUser>(`/platform/companies/${id}/users/${userId}`, { active })
// Another Owner for the company, or with userId a new password for one of its Owners.
export const setCompanyOwner = (id: number, o: { userId?: number; fullName?: string; username?: string; password: string }) =>
  post<Company>(`/platform/companies/${id}/owner`, o)

export const getPlatformNotifySettings = () => get<NotifySettings>('/platform/settings/notifications')
export const updatePlatformNotifySettings = (s: NotifySettings) => put<NotifySettings>('/platform/settings/notifications', s)
export const sendPlatformTestAlert = (botToken: string, chatId: string) =>
  post<{ sent: boolean }>('/platform/settings/notifications/test', { botToken, chatId })

export const listBackups = () => get<{ rows: BackupRow[]; settings: BackupSettings }>('/platform/backups')
export const updateBackupSettings = (s: BackupSettings) => put<BackupSettings>('/platform/backups/settings', s)
export const runBackupNow = () => post<BackupRow>('/platform/backups/run')
export const downloadBackup = (id: number, filename: string) => downloadFile(`/platform/backups/${id}/download`, filename)
export const deleteBackup = (id: number) => del(`/platform/backups/${id}`)

// Wipes every company. Typed confirmation: the server wants "RESET".
export const resetForProduction = (confirm: string) => post<{ reset: boolean; at: string }>('/platform/reset-for-production', { confirm })
