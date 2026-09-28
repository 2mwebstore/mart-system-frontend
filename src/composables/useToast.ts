import { reactive } from 'vue'

export interface Toast {
  id: number
  type: 'success' | 'error' | 'info'
  message: string
}

let nextId = 1
export const toasts = reactive<Toast[]>([])

function push(type: Toast['type'], message: string) {
  const id = nextId++
  toasts.push({ id, type, message })
  setTimeout(() => dismiss(id), 5000)
}

export function dismiss(id: number) {
  const idx = toasts.findIndex((t) => t.id === id)
  if (idx !== -1) toasts.splice(idx, 1)
}

export function useToast() {
  return {
    toasts,
    success: (message: string) => push('success', message),
    error: (message: string) => push('error', message),
    info: (message: string) => push('info', message),
    dismiss,
  }
}
