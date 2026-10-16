import { del, get, getPaged, post, put, type PageQuery } from './http'
import type { Invoice, InvoiceInput, InvoicePaymentInput, InvoiceSummary } from '@/types/domain'

// status: 'open' (default) | 'cancelled' | 'all'; paymentStatus: DUE | PENDING
// | PAID | unpaid (DUE + PENDING) | overdue.
export const pageInvoices = (
  branchId: number,
  q: PageQuery & { q?: string; status?: string | null; paymentStatus?: string | null; dateFrom?: string | null; dateTo?: string | null },
) => getPaged<Invoice[], InvoiceSummary>('/invoices', { branchId, ...q })
export const getInvoice = (id: number) => get<Invoice>(`/invoices/${id}`)
export const createInvoice = (input: InvoiceInput) => post<Invoice>('/invoices', input)
export const updateInvoice = (id: number, input: InvoiceInput) => put<Invoice>(`/invoices/${id}`, input)
export const cancelInvoice = (id: number, reason: string) => post<Invoice>(`/invoices/${id}/cancel`, { reason })
export const addInvoicePayment = (id: number, input: InvoicePaymentInput) => post<Invoice>(`/invoices/${id}/payments`, input)
export const deleteInvoicePayment = (id: number, paymentId: number) => del<Invoice>(`/invoices/${id}/payments/${paymentId}`)
