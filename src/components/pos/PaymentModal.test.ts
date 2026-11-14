import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { i18n } from '@/i18n'
import type { Currency } from '@/types/domain'
import { useSettingsStore } from '@/stores/settings'
import PaymentModal from './PaymentModal.vue'

vi.mock('@/api/settings', () => ({
  listPaymentMethods: async () => [
    { id: 1, name: 'Cash', type: 'CASH', feePercent: 0, enabled: true },
    { id: 2, name: 'Card', type: 'CARD', feePercent: 0, enabled: true },
  ],
}))

let app: App | null = null
let paid: unknown[] = []
let drafts: unknown[] = []

async function settle() {
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r))
    await nextTick()
  }
}

// The payment popup at ៛4,100: a dollar company's $3.15, or a riel
// company's ៛12,915 (paid in cash as ៛12,900), unless another total is given.
async function open(mainCurrency: Currency, extra: Record<string, unknown> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const settings = useSettingsStore()
  settings.rate = 4100
  settings.app = { ...settings.app, mainCurrency }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const totalCents = mainCurrency === 'KHR' ? 12915 : 315
  app = createApp({
    render: () => h(PaymentModal, { totalCents, onPaid: (p: unknown) => paid.push(p), onDraft: (d: unknown) => drafts.push(d), ...extra }),
  })
    .use(pinia)
    .use(i18n)
  app.mount(host)
  await settle()
}

const boxes = () => [...document.querySelectorAll<HTMLInputElement>('[data-money-input]')]
// The boxes in the order they're drawn: a grid item with order-first comes first.
const drawnOrder = () =>
  [...document.querySelectorAll<HTMLElement>('[data-tender-usd], [data-tender-khr]')]
    .sort((a, b) => Number(b.classList.contains('order-first')) - Number(a.classList.contains('order-first')))
    .map((d) => (d.hasAttribute('data-tender-khr') ? 'KHR' : 'USD'))
const value = (currency: 'USD' | 'KHR') => boxes()[currency === 'USD' ? 0 : 1].value
const quick = () => [...document.querySelectorAll<HTMLButtonElement>('[data-quick-amount]')].map((b) => b.getAttribute('aria-label'))
const confirm = () => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('Confirm cash'))!
async function click(el: HTMLElement) {
  el.click()
  await settle()
}
// Types `text` into a currency's box, as the browser hands it over.
async function type(currency: 'USD' | 'KHR', text: string) {
  const el = boxes()[currency === 'USD' ? 0 : 1]
  el.value = text
  el.dispatchEvent(new Event('input'))
  await settle()
}
// "Change due $0.00 + ៛ 0": the change (or remaining) line's label and amount.
const changeLine = () =>
  [...document.querySelector('[data-change-line]')!.children].map((c) => c.textContent!.replace(/\s+/g, ' ').trim()).join(' ')

afterEach(() => {
  app?.unmount()
  app = null
  document.body.innerHTML = ''
  paid = []
  drafts = []
})

describe('the cash payment', () => {
  it('leads with dollars by default, the amount due already tendered', async () => {
    await open('USD')
    expect(document.querySelector('[data-amount-due]')!.textContent).toBe('$3.15')
    expect(document.querySelector('[data-amount-other]')!.textContent).toBe('៛ 12,900')
    expect(drawnOrder()).toEqual(['USD', 'KHR'])
    expect(quick()).toEqual(['Add $1.00', 'Add $5.00', 'Add $10.00', 'Add $20.00', 'Add $50.00', 'Add $100.00'])
    expect(document.querySelector('[role="dialog"]')!.classList).toContain('max-w-5xl')
    expect([value('USD'), value('KHR')]).toEqual(['3.15', ''])
    expect(changeLine()).toBe('Change due $0.00 + ៛ 0')
    await click(confirm())
    expect(paid).toEqual([{ method: 'CASH', receivedUsdCents: 315, receivedKhrRiel: 0, reference: '' }])
  })

  it('leads with riel for a riel company, the cash amount due already tendered', async () => {
    await open('KHR')
    // ៛12,915 is paid in cash to the ៛100 note, with the dollars under it.
    expect(document.querySelector('[data-amount-due]')!.textContent).toBe('៛ 12,900')
    expect(document.querySelector('[data-amount-other]')!.textContent).toBe('$3.15')
    expect(drawnOrder()).toEqual(['KHR', 'USD'])
    expect(quick()).toEqual(['Add ៛ 1,000', 'Add ៛ 5,000', 'Add ៛ 10,000', 'Add ៛ 20,000', 'Add ៛ 50,000', 'Add ៛ 100,000'])
    expect([value('USD'), value('KHR')]).toEqual(['', '12,900'])
    await type('KHR', '12,000')
    expect(changeLine()).toBe('Remaining ៛ 900 ($0.22)')
  })

  it('pays the riel amount shown', async () => {
    await open('KHR')
    expect(confirm().disabled).toBe(false)
    await click(confirm())
    expect(paid).toEqual([{ method: 'CASH', receivedUsdCents: 0, receivedKhrRiel: 12900, reference: '' }])
  })

  it('takes a note pressed in place of the amount filled in, then adds the next ones', async () => {
    await open('KHR')
    const [k1000, k5000, k10000] = [...document.querySelectorAll<HTMLButtonElement>('[data-quick-amount]')]
    await click(k10000)
    expect(value('KHR')).toBe('10,000')
    await click(k1000)
    expect(value('KHR')).toBe('11,000')
    expect(confirm().disabled).toBe(true)
    await click(k5000)
    expect(value('KHR')).toBe('16,000')
    // A riel company gives all change in riel.
    expect(changeLine()).toBe('Change due ៛ 3,100')
    expect(value('USD')).toBe('')
  })

  it('takes riel typed in place of the dollars filled in, then keeps both for a mixed payment', async () => {
    await open('USD')
    await type('KHR', '20000')
    expect([value('USD'), value('KHR')]).toEqual(['', '20,000'])
    await type('USD', '1')
    expect([value('USD'), value('KHR')]).toEqual(['1', '20,000'])
    await click(confirm())
    expect(paid).toEqual([{ method: 'CASH', receivedUsdCents: 100, receivedKhrRiel: 20000, reference: '' }])
  })

  it('takes dollars typed in place of the riel filled in', async () => {
    await open('KHR')
    await type('USD', '5')
    expect([value('USD'), value('KHR')]).toEqual(['5', ''])
    // $5 counts as ៛20,500 at the rate: ៛7,600 back, all in riel.
    expect(changeLine()).toBe('Change due ៛ 7,600')
  })

  it('shows photos of the dollar notes, and of the riel notes at a riel company', async () => {
    const shown = (currency: string) =>
      [...document.querySelectorAll<HTMLImageElement>('[data-quick-amount] img[data-note-photo]')].map(
        (i) => i.getAttribute('src')!.match(new RegExp(`${currency}-(\\d+)\\.jpg`))![1],
      )
    await open('USD')
    expect(shown('usd')).toEqual(['1', '5', '10', '20', '50', '100'])
    expect(document.querySelector('[data-note-drawn]')).toBeNull()
    app!.unmount()
    document.body.innerHTML = ''
    await open('KHR')
    expect(shown('khr')).toEqual(['1000', '5000', '10000', '20000', '50000', '100000'])
    expect(document.querySelector('[data-note-drawn]')).toBeNull()
  })

  it('gives a riel company all its change in riel when paid in dollars', async () => {
    await open('KHR', { totalCents: 15600 })
    await type('USD', '5')
    expect(changeLine()).toBe('Change due ៛ 4,900')
    // The customer display gets the same change, none of it in dollars.
    expect(drafts.at(-1)).toEqual(expect.objectContaining({ receivedUsdCents: 500, receivedKhrRiel: 0, changeUsdCents: 0, changeKhrRiel: 4900, shortCents: 0 }))
    await click(confirm())
    expect(paid).toEqual([{ method: 'CASH', receivedUsdCents: 500, receivedKhrRiel: 0, reference: '' }])
  })

  it('takes a riel total rounded to the ៛100 note, and no less', async () => {
    await open('KHR', { totalCents: 17050 })
    expect(document.querySelector('[data-amount-due]')!.textContent).toBe('៛ 17,100')
    await type('KHR', '17000')
    expect(changeLine()).toBe('Remaining ៛ 100 ($0.02)')
    expect(confirm().disabled).toBe(true)
    await type('KHR', '17100')
    expect(changeLine()).toBe('Change due ៛ 0')
    expect(confirm().disabled).toBe(false)
  })

  it('shows a riel tax in riel', async () => {
    await open('KHR', { taxCents: 1174, taxLabel: 'VAT 10%' })
    expect(document.querySelector('[data-tax-line]')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Tax · VAT 10% · ៛ 1,174')
  })

  it('names the tax in the amount due, with its amount', async () => {
    await open('USD', { taxCents: 18, taxLabel: 'VAT 10%' })
    expect(document.querySelector('[data-tax-line]')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Tax · VAT 10% · $0.18')
  })

  it('leaves Quick cash and the change out for a card payment', async () => {
    await open('USD')
    expect(document.querySelector('[data-quick-cash]')).not.toBeNull()
    await click(document.querySelector<HTMLButtonElement>('button.input')!)
    const card = [...document.querySelectorAll<HTMLButtonElement>('[data-searchable-drop] button')].find((b) => b.textContent!.includes('Card'))!
    card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await settle()
    expect(document.querySelector('[data-quick-cash]')).toBeNull()
    expect(document.querySelector('[data-change-line]')).toBeNull()
    expect(boxes()).toEqual([])
    await click(document.querySelector<HTMLButtonElement>('.btn-primary')!)
    expect(paid).toEqual([{ method: 'CARD', receivedUsdCents: 0, receivedKhrRiel: 0, reference: '' }])
  })

  it('empties both boxes with Clear amount, and the notes tapped next add up from zero', async () => {
    await open('USD')
    await click(document.querySelectorAll<HTMLButtonElement>('[data-quick-amount]')[3])
    await type('KHR', '4000')
    expect([value('USD'), value('KHR')]).toEqual(['20.00', '4,000'])
    await click(document.querySelector<HTMLElement>('[data-clear-tendered]')!)
    expect([value('USD'), value('KHR')]).toEqual(['', ''])
    expect(changeLine()).toBe('Remaining $3.15 (៛ 12,900)')
    expect(confirm().disabled).toBe(true)
    await click(document.querySelectorAll<HTMLButtonElement>('[data-quick-amount]')[1])
    await click(document.querySelectorAll<HTMLButtonElement>('[data-quick-amount]')[0])
    expect([value('USD'), value('KHR')]).toEqual(['6.00', ''])
  })

  it('counts the taps on each note on its badge, from zero after Clear amount or typing', async () => {
    const counts = () =>
      [...document.querySelectorAll<HTMLButtonElement>('[data-quick-amount]')].map((b) => b.querySelector('[data-note-count]')?.textContent!.trim() ?? '')
    await open('KHR')
    const notes = () => document.querySelectorAll<HTMLButtonElement>('[data-quick-amount]')
    // Opened with the amount due filled in: no note tapped yet, no badge.
    expect(counts()).toEqual(['', '', '', '', '', ''])
    await click(notes()[2])
    await click(notes()[2])
    await click(notes()[0])
    expect(counts()).toEqual(['×1', '', '×2', '', '', ''])
    expect(value('KHR')).toBe('21,000')
    expect(notes()[2].getAttribute('aria-label')).toBe('Add ៛ 10,000 (2 added)')
    expect(notes()[2].className).toContain('border-primary')
    expect(notes()[1].className).toContain('border-line')
    // Dollars typed in leave the riel notes counted.
    await type('USD', '1')
    expect(counts()).toEqual(['×1', '', '×2', '', '', ''])
    await click(document.querySelector<HTMLElement>('[data-clear-tendered]')!)
    expect(counts()).toEqual(['', '', '', '', '', ''])
    await click(notes()[5])
    expect(counts()).toEqual(['', '', '', '', '', '×1'])
    // Riel typed in: the box no longer matches the notes, so the count starts again.
    await type('KHR', '5000')
    expect(counts()).toEqual(['', '', '', '', '', ''])
  })

  it('has no hint line and no Exact amount button in Quick cash, and Clear amount sits under the notes', async () => {
    await open('KHR')
    const panel = document.querySelector('[data-quick-cash]')!
    expect(panel.querySelector('p')).toBeNull()
    expect(panel.textContent).not.toContain('Exact amount')
    const last = panel.lastElementChild as HTMLElement
    expect(last.matches('[data-clear-tendered]')).toBe(true)
    expect(last.textContent!.trim()).toBe('Clear amount')
  })
})
