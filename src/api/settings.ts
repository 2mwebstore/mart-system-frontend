import { del, get, post, put } from './http'
import type { AppSettings, Branch, ExchangeRateEntry, PaymentMethodRow, PublicTill, Till } from '@/types/domain'

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
