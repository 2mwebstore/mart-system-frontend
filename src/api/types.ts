// Pagination meta as it arrives on the wire (snake_case); getPaged() converts
// it to PageMeta.
export interface ApiMeta {
  page: number
  per_page: number
  total: number
  total_pages: number
  summary?: unknown
}

export interface ApiError {
  code: string
  message: string
  fields?: Record<string, string>
}

export interface ApiEnvelope<T> {
  success: boolean
  data: T
  meta?: ApiMeta
  error: ApiError | null
}
