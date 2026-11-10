import { del, get, post, put } from './http'
import { getCompanyCode } from './companyCode'
import type {
  ActivityLogRetention,
  AppSettings,
  Branding,
  Branch,
  DocType,
  ExchangeRateEntry,
  NotifySettings,
  NumberSequence,
  PaymentMethodRow,
  PublicTill,
  TaxDefaults,
  TaxRate,
  Till,
} from '@/types/domain'

export const listBranches = () => get<Branch[]>('/branches')
export const createBranch = (b: Omit<Branch, 'id'>) => post<Branch>('/branches', b)
export const updateBranch = (id: number, b: Omit<Branch, 'id'>) => put<Branch>(`/branches/${id}`, b)
export const deleteBranch = (id: number) => del(`/branches/${id}`)

// Public: the POS sign-in screen lists tills before anyone is authenticated,
// one company's at a time. Without a code, the company this browser works for.
export const listPublicTills = (companyCode = getCompanyCode()) =>
  get<PublicTill[]>('/auth/tills', { company: companyCode }, { silent: true })
export const listTills = () => get<Till[]>('/devices')
export const createTill = (t: { branchId: number; name: string; deviceKey: string; active: boolean }) => post<Till>('/devices', t)
export const updateTill = (id: number, t: { branchId: number; name: string; deviceKey: string; active: boolean }) => put<Till>(`/devices/${id}`, t)
export const deleteTill = (id: number) => del(`/devices/${id}`)

export const listPaymentMethods = () => get<PaymentMethodRow[]>('/payment-methods')
export type PaymentMethodInput = Omit<PaymentMethodRow, 'id'>
export const createPaymentMethod = (p: PaymentMethodInput) => post<PaymentMethodRow>('/payment-methods', p)
export const updatePaymentMethod = (id: number, p: PaymentMethodInput) => put<PaymentMethodRow>(`/payment-methods/${id}`, p)
export const deletePaymentMethod = (id: number) => del(`/payment-methods/${id}`)

// Every signed-in user lists them: the till and the forms pick from them.
export const listTaxRates = () => get<TaxRate[]>('/tax-rates')
export type TaxRateInput = Omit<TaxRate, 'id'>
export const createTaxRate = (r: TaxRateInput) => post<TaxRate>('/tax-rates', r)
export const updateTaxRate = (id: number, r: TaxRateInput) => put<TaxRate>(`/tax-rates/${id}`, r)
export const deleteTaxRate = (id: number) => del(`/tax-rates/${id}`)
// Every place's starting rate at once (null: no tax).
export const updateTaxDefaults = (d: TaxDefaults) => put<TaxDefaults>('/tax-rates/defaults', d)

export const getSettings = () => get<AppSettings>('/settings')

// Company name + logo. Public — the sign-in pages show them too, for the
// company whose code is given (none: the app's own). `logo` left out keeps
// the current one; '' removes it.
export const getBranding = (companyCode: string) => get<Branding>('/auth/branding', { company: companyCode }, { silent: true })
export const updateBranding = (b: { companyName: string; logo?: string }) => put<Branding>('/settings/branding', b)
export const updateSettings = (s: AppSettings) => put<AppSettings>('/settings', s)
// The customer the POS starts every sale with; null for walk-in.
export const updateDefaultCustomer = (customerId: number | null) => put<AppSettings>('/settings/default-customer', { customerId })

export const getExchangeRate = () => get<{ rate: number; history: ExchangeRateEntry[] }>('/exchange-rate')
export const setExchangeRate = (rate: number) => post<{ rate: number; history: ExchangeRateEntry[] }>('/exchange-rate', { rate })

// ---- Telegram alerts ----------------------------------------------------------
// The company's own. The super admin's backup alerts are in api/platform.ts.
export const getNotifySettings = () => get<NotifySettings>('/settings/notifications')
export const updateNotifySettings = (s: NotifySettings) => put<NotifySettings>('/settings/notifications', s)
export const sendTestAlert = (botToken: string, chatId: string) =>
  post<{ sent: boolean }>('/settings/notifications/test', { botToken, chatId })

// ---- Document numbering ----------------------------------------------------
export const getNumberSequences = () => get<NumberSequence[]>('/settings/numbering')
export const updateNumberSequence = (docType: DocType, s: { prefix: string; nextNumber: number }) =>
  put<NumberSequence>('/settings/numbering', { docType, ...s })

// ---- Audit log retention ---------------------------------------------------
// Read only: the super admin sets it (see platform.updateCompany).
export const getActivityLogRetention = () => get<ActivityLogRetention>('/settings/activity-log-retention')

// ---- Store-wide stock-sale policy -------------------------------------------
// Whether a sale can go through at 0/negative stock — one switch for the
// whole catalog (see docs/DECISIONS.md for why this replaced a per-product
// toggle). The current value is read via getSettings() (public); this only
// writes it.
export const updateStockPolicy = (allowOutOfStockSale: boolean) =>
  put<{ allowOutOfStockSale: boolean }>('/settings/stock-policy', { allowOutOfStockSale })

