/* eslint-disable vue/one-component-per-file -- a stand-in editor beside the test's own app */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { i18n, t } from '@/i18n'
import type { ExpenseInput } from '@/api/people'
import type { Expense, TaxRate } from '@/types/domain'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { formatUSD } from '@/utils/format'
import ExpenseForm from './ExpenseForm.vue'

// The real editor is Tiptap, which needs a browser layout; a textarea stands in
// for it with the same v-model (HTML).
vi.mock('@/components/RichTextEditor.vue', () => ({
  default: defineComponent({
    props: { modelValue: { type: String, default: '' }, label: String, id: String },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () =>
        h('textarea', {
          'data-rich-note': '',
          value: props.modelValue,
          onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLTextAreaElement).value),
        })
    },
  }),
}))

const rates: TaxRate[] = [
  { id: 1, name: 'VAT 10%', percent: 10, active: true } as TaxRate,
  { id: 2, name: 'Old', percent: 20, active: false } as TaxRate,
  { id: 3, name: 'Low', percent: 5, active: true } as TaxRate,
]

let app: App | null = null
let host: HTMLElement
let saved: ExpenseInput[] = []

async function settle() {
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r))
    await nextTick()
  }
}

async function mount(expense: Expense | null = null) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().$patch({ branches: [{ id: 1, code: 'TK', name: 'Toul Kork' }] as never, activeBranchId: 1 })
  const settings = useSettingsStore()
  settings.taxRates = rates
  settings.app = { ...settings.app, taxDefaults: { pos: null, invoice: null, purchase: null, expense: 1 } }

  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({ render: () => h(ExpenseForm, { expense, branchId: 1, onSave: (b: ExpenseInput) => saved.push(b) }) })
    .use(pinia)
    .use(i18n)
  app.mount(host)
  await settle()
}

function typeAmount(v: string) {
  const el = host.querySelector<HTMLInputElement>('#expense-amount')!
  el.value = v
  el.dispatchEvent(new Event('input'))
}
const totals = () => host.querySelector('[data-expense-totals]')!.textContent ?? ''
// The Tax picker: open it and pick an option by its label.
async function pickTax(optionLabel: string) {
  const wrapper = [...host.querySelectorAll<HTMLElement>('div.relative')].find((d) => d.querySelector('span')?.textContent?.trim() === t('tax.label'))!
  wrapper.querySelector<HTMLButtonElement>('button')!.click()
  await settle()
  const option = [...document.querySelectorAll<HTMLButtonElement>('[data-searchable-drop] button')].find((b) => b.textContent?.includes(optionLabel))!
  option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  await settle()
}
async function submit() {
  host.querySelector('form')!.dispatchEvent(new Event('submit'))
  await settle()
}

beforeEach(() => {
  saved = []
})
afterEach(() => {
  app?.unmount()
  app = null
  host.remove()
  document.body.innerHTML = ''
})

describe('the expense form', () => {
  it('starts a new expense with the expenses’ starting rate and adds the tax on top', async () => {
    await mount()
    typeAmount('5.05')
    await settle()

    expect(totals()).toContain(formatUSD(51))
    expect(totals()).toContain(formatUSD(556))

    const note = host.querySelector<HTMLTextAreaElement>('[data-rich-note]')!
    note.value = '<p>Fuel <strong>van</strong></p>'
    note.dispatchEvent(new Event('input'))
    await submit()

    expect(saved).toEqual([expect.objectContaining({ amountCents: 505, taxRateId: 1, branchId: 1, note: '<p>Fuel <strong>van</strong></p>' })])
  })

  it('sends no rate for No tax, and the total is the amount', async () => {
    await mount()
    typeAmount('10')
    await pickTax(t('tax.none'))

    expect(totals()).not.toContain(t('tax.line', { name: '' }).trim())
    expect(totals()).toContain(formatUSD(1000))
    await submit()
    expect(saved[0]).toMatchObject({ amountCents: 1000, taxRateId: null })
  })

  it('an edited expense keeps its own rate as it was kept, even switched off since', async () => {
    const expense = {
      id: 9,
      branchId: 1,
      category: 'OTHER',
      amountCents: 1000,
      expenseDate: '2026-11-01',
      note: '<p>old</p>',
      taxRateId: 2,
      taxName: 'Old',
      taxPercent: 10,
      taxCents: 100,
      totalCents: 1100,
    } as unknown as Expense
    await mount(expense)

    // Its kept 10%, not the rate's 20% now.
    expect(totals()).toContain(formatUSD(100))
    expect(totals()).toContain(formatUSD(1100))
    await submit()
    expect(saved[0]).toMatchObject({ amountCents: 1000, taxRateId: 2, note: '<p>old</p>' })
  })

  it('another rate picked on an edit is that rate now', async () => {
    const expense = { id: 9, branchId: 1, category: 'OTHER', amountCents: 1000, expenseDate: '2026-11-01', note: '', taxRateId: null, taxName: '', taxPercent: 0, taxCents: 0, totalCents: 1000 } as unknown as Expense
    await mount(expense)
    expect(totals()).toContain(formatUSD(1000))

    await pickTax('Low')
    expect(totals()).toContain(formatUSD(50))
    expect(totals()).toContain(formatUSD(1050))
    await submit()
    expect(saved[0]).toMatchObject({ taxRateId: 3 })
  })
})
