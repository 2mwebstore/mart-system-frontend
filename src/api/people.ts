import { del, get, getPaged, post, put, type PageQuery } from './http'
import type { Customer, Expense, Permission, Role, StaffUser } from '@/types/domain'

export const listCustomers = () => get<Customer[]>('/customers')
export const pageCustomers = (q: PageQuery & { q?: string; tier?: string | null }) => getPaged<Customer[]>('/customers', { ...q })
export type CustomerInput = { name: string; phone: string; tier: 'MEMBER' | 'GOLD' }
export const createCustomer = (c: CustomerInput) => post<Customer>('/customers', c)
export const updateCustomer = (id: number, c: CustomerInput) => put<Customer>(`/customers/${id}`, c)
export const deleteCustomer = (id: number) => del(`/customers/${id}`)

// amountCents is before tax; taxRateId null for no tax; note is rich text (HTML).
export type ExpenseInput = { branchId: number; category: string; amountCents: number; taxRateId: number | null; expenseDate: string; note: string }
// The summary's totalCents is what was paid (tax included), taxCents the tax in it.
export const pageExpenses = (branchId: number, q: PageQuery & { q?: string; category?: string | null; dateFrom?: string | null; dateTo?: string | null }) =>
  getPaged<Expense[], { totalCents: number; taxCents: number; categories: number }>('/expenses', { branchId, ...q })
export const createExpense = (e: ExpenseInput) => post<Expense>('/expenses', e)
export const updateExpense = (id: number, e: ExpenseInput) => put<Expense>(`/expenses/${id}`, e)
export const deleteExpense = (id: number) => del(`/expenses/${id}`)

export type UserInput = {
  fullName: string
  username: string
  phone: string
  roleId: number
  branchIds: number[]
  // A role other than the main one at some of branchIds.
  branchRoles: { branchId: number; roleId: number }[]
  active: boolean
  password?: string
  pin?: string
}
export const listUsers = () => get<StaffUser[]>('/users')
export const pageUsers = (q: PageQuery & { q?: string; roleId?: number | null; branchId?: number | null; active?: boolean | null }) =>
  getPaged<StaffUser[]>('/users', { ...q })
// One user, as the list shows them (404 for someone at no branch the viewer has).
export const getUser = (id: number) => get<StaffUser>(`/users/${id}`)
export const createUser = (u: UserInput) => post<StaffUser>('/users', u)
export const updateUser = (id: number, u: UserInput) => put<StaffUser>(`/users/${id}`, u)
export const deleteUser = (id: number) => del(`/users/${id}`)
export const resetUserPin = (id: number) => post<{ pin: string }>(`/users/${id}/reset-pin`)

export type RoleInput = {
  name: string
  description: string
  // Only read when the role is made: the branch it belongs to, or null for a
  // role every branch shares (Owner only).
  branchId?: number | null
  permissions: string[]
  maxDiscountPercent: number
  refundWithoutApprovalCents: number
}
// Shared roles plus the caller's branches' roles. With a branch, that branch's
// roles only, and user counts for that branch.
export const listRoles = (branchId?: number | null) => get<Role[]>('/roles', { branchId })
export const listPermissions = () => get<Permission[]>('/permissions')
export const createRole = (r: RoleInput) => post<Role>('/roles', r)
export const updateRole = (id: number, r: RoleInput) => put<Role>(`/roles/${id}`, r)
export const deleteRole = (id: number) => del(`/roles/${id}`)
