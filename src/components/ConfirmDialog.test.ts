import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
import { i18n, t } from '@/i18n'
import Modal from './Modal.vue'
import ConfirmDialog from './ConfirmDialog.vue'

let app: App | null = null
let events: string[] = []

async function open(props: Record<string, unknown> = {}, { over = false } = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const busy = ref(!!props.busy)
  const dialog = () =>
    h(ConfirmDialog, {
      title: 'Clear this sale?',
      message: 'All items in the cart will be removed.',
      confirmLabel: 'Clear',
      ...props,
      busy: busy.value,
      onClose: () => events.push('close'),
      onConfirm: (reason: string) => events.push(`confirm:${reason}`),
    })
  // Opened over another popup (held sales, this shift's sales), or on its own.
  app = createApp({
    render: () => (over ? h(Modal, { title: 'Held sales', onClose: () => events.push('close under') }, () => [dialog()]) : dialog()),
  }).use(i18n)
  app.mount(host)
  await nextTick()
  return busy
}

const dialog = () => document.querySelector<HTMLElement>('[data-confirm-dialog]')!.closest<HTMLElement>('[role="dialog"]')!
const button = (text: string) => [...dialog().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text)!
const reasonBox = () => dialog().querySelector<HTMLTextAreaElement>('textarea')
async function submit() {
  dialog().querySelector('form')!.dispatchEvent(new Event('submit'))
  await nextTick()
}
function pressEsc() {
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
}

afterEach(() => {
  app?.unmount()
  app = null
  document.body.innerHTML = ''
  events = []
})

describe('the "are you sure?" popup', () => {
  it('asks in a popup of its own, with Cancel ready', async () => {
    await open()
    expect(dialog().getAttribute('aria-label')).toBe('Clear this sale?')
    expect(dialog().textContent).toContain('All items in the cart will be removed.')
    expect(reasonBox()).toBeNull()
    expect(document.activeElement).toBe(button(t('common.cancel')))
    expect(button('Clear').classList).toContain('btn-danger')
  })

  it('goes ahead only on its button', async () => {
    await open()
    expect(events).toEqual([])
    button('Clear').click()
    await nextTick()
    expect(events).toEqual(['confirm:'])
  })

  it('asks why when there is a reason to give, and sends it', async () => {
    await open({ title: 'Void INV-000001?', confirmLabel: 'Void sale', reasonLabel: 'Reason', reasonPlaceholder: 'e.g. wrong item' })
    const box = reasonBox()!
    expect(document.activeElement).toBe(box)
    expect(box.placeholder).toBe('e.g. wrong item')
    expect(box.maxLength).toBe(255)
    box.value = '  wrong item  '
    box.dispatchEvent(new Event('input'))
    await submit()
    expect(events).toEqual(['confirm:wrong item'])
  })

  it('closes on Cancel, ×, and Esc', async () => {
    await open()
    button(t('common.cancel')).click()
    dialog().querySelector<HTMLButtonElement>(`[aria-label="${t('common.closeDialog')}"]`)!.click()
    pressEsc()
    expect(events).toEqual(['close', 'close', 'close'])
  })

  it('over another popup, sits on top and Esc closes only it', async () => {
    await open({}, { over: true })
    const dialogs = [...document.querySelectorAll('[role="dialog"]')]
    expect(dialogs).toHaveLength(2)
    // Not inside the popup underneath (its scroll box can't cut it off), and
    // last in the page, so drawn over it.
    expect(dialogs[1]).toBe(dialog())
    expect(dialogs[0].contains(dialog())).toBe(false)
    expect(document.body.lastElementChild!.contains(dialog())).toBe(true)
    pressEsc()
    expect(events).toEqual(['close'])
  })

  it('does nothing more while it works', async () => {
    await open({ busy: true, reasonLabel: 'Reason' })
    expect(button('Clear').disabled).toBe(true)
    expect(button(t('common.cancel')).disabled).toBe(true)
    expect(reasonBox()!.disabled).toBe(true)
    await submit()
    pressEsc()
    expect(events).toEqual([])
  })
})
