// Thin typed wrappers around the axios client. The backend speaks snake_case
// JSON; the app speaks camelCase. Keys are converted in both directions here
// (values are never touched), so API modules and pages only ever see camelCase.
import type { AxiosRequestConfig } from 'axios'
import { apiClient } from './client'
import type { ApiEnvelope } from './types'

const toCamel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype
}

function mapKeys(value: unknown, fn: (s: string) => string): unknown {
  if (Array.isArray(value)) return value.map((v) => mapKeys(v, fn))
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [fn(k), mapKeys(v, fn)]))
  }
  return value
}

export type Params = Record<string, string | number | boolean | null | undefined>

function cleanParams(params?: Params) {
  if (!params) return undefined
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') out[toSnake(k)] = v
  }
  return out
}

// `silent` suppresses the global error toast for calls whose failure the
// caller handles itself (e.g. an optional section the user may not have
// permission to see).
export interface RequestOptions {
  silent?: boolean
}

function config(params?: Params, opts?: RequestOptions): AxiosRequestConfig {
  return { params: cleanParams(params), ...(opts?.silent ? { silent: true } : {}) } as AxiosRequestConfig
}

export async function get<T>(path: string, params?: Params, opts?: RequestOptions): Promise<T> {
  const { data } = await apiClient.get<ApiEnvelope<unknown>>(path, config(params, opts))
  return mapKeys(data.data, toCamel) as T
}

// One page of a list plus its meta. `summary` holds whole-result figures the
// server computes (KPI cards, footer totals) that a single page can't give.
export interface PageMeta<S = undefined> {
  page: number
  perPage: number
  total: number
  totalPages: number
  summary: S
}
export interface PageQuery {
  page: number
  perPage: number
}
export interface Paged<T, S = undefined> {
  data: T
  meta: PageMeta<S>
}

export async function getPaged<T, S = undefined>(path: string, params?: Params, opts?: RequestOptions): Promise<Paged<T, S>> {
  const { data } = await apiClient.get<ApiEnvelope<unknown>>(path, config(params, opts))
  return { data: mapKeys(data.data, toCamel) as T, meta: mapKeys(data.meta, toCamel) as PageMeta<S> }
}

export async function send<T>(method: 'post' | 'put' | 'delete', path: string, body?: unknown, params?: Params, opts?: RequestOptions): Promise<T> {
  const { data } = await apiClient.request<ApiEnvelope<unknown>>({
    method,
    url: path,
    data: body === undefined ? undefined : mapKeys(body, toSnake),
    ...config(params, opts),
  })
  return mapKeys(data.data, toCamel) as T
}

export const post = <T>(path: string, body?: unknown, params?: Params, opts?: RequestOptions) => send<T>('post', path, body, params, opts)
export const put = <T>(path: string, body?: unknown, params?: Params, opts?: RequestOptions) => send<T>('put', path, body, params, opts)
export const del = <T = { deleted: boolean }>(path: string, params?: Params, opts?: RequestOptions) => send<T>('delete', path, undefined, params, opts)
