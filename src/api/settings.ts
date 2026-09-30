import { del, downloadFile, get, post, put } from './http'
import type {
  ActivityLogRetention,
  AppSettings,
  BackupRow,
  BackupSettings,
  Branch,
  DocType,
  ExchangeRateEntry,
  NotifySettings,
  NumberSequence,
  PaymentMethodRow,
  PublicTill,
  Till,
} from '@/types/domain'

export const listBranches = () => get<Branch[]>('/branches')
export const createBranch = (b: Omit<Branch, 'id'>) => post<Branch>('/branches', b)
export const updateBranch = (id: number, b: Omit<Branch, 'id'>) => put<Branch>(`/branches/${id}`, b)
export const deleteBranch = (id: number) => del(`/branches/${id}`)

// Public: the POS sign-in screen lists tills before anyone is authenticated.
export const listPublicTills = () => get<PublicTill[]>('/auth/tills')
export const listTills = () => get<Till[]>('/devices')
export const createTill = (t: { branchId: number; name: string; deviceKey: string; active: boolean }) => post<Till>('/devices', t)
export const updateTill = (id: number, t: { branchId: number; name: string; deviceKey: string; active: boolean }) => put<Till>(`/devices/${id}`, t)
export const deleteTill = (id: number) => del(`/devices/${id}`)

export const listPaymentMethods = () => get<PaymentMethodRow[]>('/payment-methods')
export type PaymentMethodInput = Omit<PaymentMethodRow, 'id'>
export const createPaymentMethod = (p: PaymentMethodInput) => post<PaymentMethodRow>('/payment-methods', p)
export const updatePaymentMethod = (id: number, p: PaymentMethodInput) => put<PaymentMethodRow>(`/payment-methods/${id}`, p)
export const deletePaymentMethod = (id: number) => del(`/payment-methods/${id}`)

export const getSettings = () => get<AppSettings>('/settings')
export const updateSettings = (s: AppSettings) => put<AppSettings>('/settings', s)

export const getExchangeRate = () => get<{ rate: number; history: ExchangeRateEntry[] }>('/exchange-rate')
export const setExchangeRate = (rate: number) => post<{ rate: number; history: ExchangeRateEntry[] }>('/exchange-rate', { rate })

// ---- Telegram alerts ----------------------------------------------------------
export const getNotifySettings = () => get<NotifySettings>('/settings/notifications')
export const updateNotifySettings = (s: NotifySettings) => put<NotifySettings>('/settings/notifications', s)
export const sendTestAlert = (botToken: string, chatId: string) =>
  post<{ sent: boolean }>('/settings/notifications/test', { botToken, chatId })

// ---- Database backups -----------------------------------------------------------
export const listBackups = () => get<{ rows: BackupRow[]; settings: BackupSettings }>('/backups')
export const updateBackupSettings = (s: BackupSettings) => put<BackupSettings>('/backups/settings', s)
export const runBackupNow = () => post<BackupRow>('/backups/run')
export const downloadBackup = (id: number, filename: string) => downloadFile(`/backups/${id}/download`, filename)
export const deleteBackup = (id: number) => del(`/backups/${id}`)

// ---- Document numbering ----------------------------------------------------
export const getNumberSequences = () => get<NumberSequence[]>('/settings/numbering')
export const updateNumberSequence = (docType: DocType, s: { prefix: string; nextNumber: number }) =>
  put<NumberSequence>('/settings/numbering', { docType, ...s })

// ---- Audit log retention ---------------------------------------------------
export const getActivityLogRetention = () => get<ActivityLogRetention>('/settings/activity-log-retention')
export const updateActivityLogRetention = (retentionMonths: number) =>
  put<ActivityLogRetention>('/settings/activity-log-retention', { retentionMonths })
export const clearActivityLogNow = () => post<{ deleted: number }>('/settings/activity-log-retention/clear')

// ---- Store-wide stock-sale policy -------------------------------------------
// Whether a sale can go through at 0/negative stock — one switch for the
// whole catalog (see docs/DECISIONS.md for why this replaced a per-product
// toggle). The current value is read via getSettings() (public); this only
// writes it.
export const updateStockPolicy = (allowOutOfStockSale: boolean) =>
  put<{ allowOutOfStockSale: boolean }>('/settings/stock-policy', { allowOutOfStockSale })

// ---- Production reset (danger zone) ----------------------------------------
export const resetForProduction = (confirm: string) => post<{ reset: boolean; at: string }>('/system/reset-for-production', { confirm })
