// A delete the server refused because other records still point at the one
// being deleted (a product on a sale, a customer on an invoice, a till with
// shifts…): 409, a code ending in _IN_USE, and what uses it in
// error.details. The app shows it in an alert (components/InUseAlert.vue).
import type { AxiosError } from 'axios'
import type { ApiEnvelope } from '@/api/types'

export interface InUseUse {
  // sales, invoices, stock_moves… (inUse.what.* in the translations)
  what: string
  count: number
}

export interface InUseInfo {
  // product, category, branch… (inUse.entity.*)
  entity: string
  name: string
  nameKm?: string
  uses: InUseUse[]
  // switch_off, move_products, reassign_users (inUse.hint.*)
  hint?: string
}

interface WireDetails {
  entity?: unknown
  name?: unknown
  name_km?: unknown
  uses?: unknown
  hint?: unknown
}

// The refusal in an API error, or null for any other error.
export function inUseFrom(err: unknown): InUseInfo | null {
  const res = (err as AxiosError<ApiEnvelope<unknown>> | null)?.response
  const body = res?.data?.error
  if (res?.status !== 409 || !body?.code?.endsWith('_IN_USE')) return null
  const d = body.details as WireDetails | undefined
  if (!d || !Array.isArray(d.uses)) return null
  const uses = (d.uses as { what?: unknown; count?: unknown }[])
    .filter((u) => typeof u?.what === 'string' && typeof u?.count === 'number' && u.count > 0)
    .map((u) => ({ what: u.what as string, count: u.count as number }))
  if (uses.length === 0) return null
  return {
    entity: typeof d.entity === 'string' ? d.entity : '',
    name: typeof d.name === 'string' ? d.name : '',
    nameKm: typeof d.name_km === 'string' && d.name_km ? d.name_km : undefined,
    uses,
    hint: typeof d.hint === 'string' && d.hint ? d.hint : undefined,
  }
}
