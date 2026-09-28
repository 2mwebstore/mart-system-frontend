import { get, getPaged, type PageQuery } from './http'
import type {
  ActivityLogRow,
  ByCashierRow,
  ByProductRow,
  DashboardReport,
  PaymentMethodReportRow,
  ProfitLossReport,
  StaffReport,
  StockMovement,
  TransactionsReport,
  VoidRefundRow,
} from '@/types/domain'

export interface RangeQuery {
  branchId: number
  dateFrom: string
  dateTo: string
}

export const getDashboard = (branchId: number) => get<DashboardReport>('/reports/dashboard', { branchId })
export const getStaffReport = (q: RangeQuery) => get<StaffReport>('/reports/staff', { ...q })
export const getProfitLoss = (q: RangeQuery) => get<ProfitLossReport>('/reports/profit-loss', { ...q })

export interface TransactionsQuery extends RangeQuery {
  cashierId?: number | null
  payment?: string | null
  q?: string
  page: number
  perPage: number
}
export const getTransactions = (q: TransactionsQuery) => getPaged<TransactionsReport>('/reports/transactions', { ...q })
export const getPaymentMethodsReport = (q: RangeQuery) => get<PaymentMethodReportRow[]>('/reports/payment-methods', { ...q })

// The row-level reports are server-paged; `summary` carries the whole-range
// totals for the cards above the table.
type Range = RangeQuery & PageQuery
export const getByProduct = (q: Range) =>
  getPaged<ByProductRow[], { products: number; units: number; revenueCents: number; profitCents: number }>('/reports/by-product', { ...q })
export const getByCashier = (q: Range) =>
  getPaged<ByCashierRow[], { cashiers: number; salesCents: number; voids: number; refunds: number }>('/reports/by-cashier', { ...q })
export const getVoidsRefunds = (q: Range) =>
  getPaged<VoidRefundRow[], { events: number; voids: number; refunds: number; amountCents: number }>('/reports/voids-refunds', { ...q })
export const getStockMovementsReport = (q: Range) =>
  getPaged<StockMovement[], { movements: number; received: number; sold: number; adjustments: number }>('/reports/stock-movements', { ...q })
export const getActivityLog = (q: Range) =>
  getPaged<ActivityLogRow[], { events: number; users: number; modules: number }>('/reports/activity-log', { ...q })
