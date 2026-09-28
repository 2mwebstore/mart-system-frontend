import { del, get, getPaged, post, put, type PageQuery } from './http'
import type { Customer, Expense, Permission, Role, StaffUser } from '@/types/domain'

export const listCustomers = () => get<Customer[]>('/customers')
export const pageCustomers = (q: PageQuery & { q?: string; tier?: string | null }) => getPaged<Customer[]>('/customers', { ...q })
export type CustomerInput = { name: string; phone: string; tier: 'MEMBER' | 'GOLD' }
export const createCustomer = (c: CustomerInput) => post<Customer>('/customers', c)
export const updateCustomer = (id: number, c: CustomerInput) => put<Customer>(`/customers/${id}`, c)
export const deleteCustomer = (id: number) => del(`/customers/${id}`)

export type ExpenseInput = { branchId: number; category: string; amountCents: number; expenseDate: string; note: string }
export const pageExpenses = (branchId: number, q: PageQuery & { category?: string | null }) =>
  getPaged<Expense[], { totalCents: number }>('/expenses', { branchId, ...q })
export const createExpense = (e: ExpenseInput) => post<Expense>('/expenses', e)
export const updateExpense = (id: number, e: ExpenseInput) => put<Expense>(`/expenses/${id}`, e)
export const deleteExpense = (id: number) => del(`/expenses/${id}`)

export type UserInput = {
  fullName: string
  username: string
  phone: string
  roleId: number
  branchIds: number[]
  active: boolean
  password?: string
  pin?: string
}
export const listUsers = () => get<StaffUser[]>('/users')
export const pageUsers = (q: PageQuery & { q?: string; roleId?: number | null; branchId?: number | null; active?: boolean | null }) =>
  getPaged<StaffUser[]>('/users', { ...q })
export const createUser = (u: UserInput) => post<StaffUser>('/users', u)
export const updateUser = (id: number, u: UserInput) => put<StaffUser>(`/users/${id}`, u)
export const resetUserPin = (id: number) => post<{ pin: string }>(`/users/${id}/reset-pin`)

export type RoleInput = {
  name: string
  description: string
  permissions: string[]
  maxDiscountPercent: number
  refundWithoutApprovalCents: number
}
export const listRoles = () => get<Role[]>('/roles')
export const listPermissions = () => get<Permission[]>('/permissions')
export const createRole = (r: RoleInput) => post<Role>('/roles', r)
export const updateRole = (id: number, r: RoleInput) => put<Role>(`/roles/${id}`, r)
export const deleteRole = (id: number) => del(`/roles/${id}`)
