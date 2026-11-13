/* eslint-disable vue/one-component-per-file -- a stand-in editor beside the test's own app */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { i18n, setLocale, t } from '@/i18n'
import type { TaxRate } from '@/types/domain'
import { useSettingsStore } from '@/stores/settings'
import SaleOptionsModal, { type SaleOptions } from './SaleOptionsModal.vue'

// The real editor is Tiptap, which needs a browser layout; a textarea stands in
// for it with the same v-model (HTML), under its label as the real one shows it.
vi.mock('@/components/RichTextEditor.vue', () => ({
  default: defineComponent({
    props: { modelValue: { type: String, default: '' }, label: String, id: String },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () =>
        h('div', [
          h('span', { 'data-rich-label': '' }, props.label),
          h('textarea', {
            'data-rich-note': '',
            value: props.modelValue,
            onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLTextAreaElement).value),
          }),
        ])
    },
  }),
}))

const rates: TaxRate[] = [
  { id: 1, name: 'VAT', percent: 10, active: true } as TaxRate,
  { id: 3, name: 'Low', percent: 5, active: true } as TaxRate,
]
const start: SaleOptions = { discountType: 'amount', discountValue: 2, taxRateId: 1, note: '<p>gift</p>' }

let app: App | null = null
let host: HTMLElement
let saved: SaleOptions[] = []
let closed = 0

async function settle() {
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r))
    await nextTick()
  }
}

async function open(props: Partial<SaleOptions & { canDiscount: boolean }> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSettingsStore().taxRates = rates
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({
    render: () =>
      h(SaleOptionsModal, {
        ...start,
        canDiscount: true,
        ...props,
        onSave: (v: SaleOptions) => saved.push(v),
        onClose: () => closed++,
      }),
  })
    .use(pinia)
    .use(i18n)
  app.mount(host)
  await settle()
}

const discountInput = () => host.querySelector<HTMLInputElement>('input[type="number"]')
const note = () => host.querySelector<HTMLTextAreaElement>('[data-rich-note]')!
const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text)!
// The Tax picker's wrapper, found by its "Tax" label.
const taxPicker = () => [...host.querySelectorAll<HTMLElement>('div.relative')].find((d) => d.querySelector('span')?.textContent?.trim() === t('tax.label'))!
async function pickTax(optionLabel: string) {
  taxPicker().querySelector<HTMLButtonElement>('button')!.click()
  await settle()
  const option = [...document.querySelectorAll<HTMLButtonElement>('[data-searchable-drop] button')].find((b) => b.textContent?.includes(optionLabel))!
  option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  await settle()
}
function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  el.value = value
  el.dispatchEvent(new Event('input'))
}
async function submit() {
  host.querySelector('form')!.dispatchEvent(new Event('submit'))
  await settle()
}

afterEach(() => {
  app?.unmount()
  app = null
  host.remove()
  document.body.innerHTML = ''
  saved = []
  closed = 0
  setLocale('en')
})

describe("the POS cart's Edit popup", () => {
  it('shows the sale’s discount, tax and note together', async () => {
    await open()
    expect(host.querySelector('[role="dialog"]')!.getAttribute('aria-label')).toBe('Discount, tax and note')
    expect(host.textContent).toContain(t('pos.totalDiscount'))
    expect(button('$').getAttribute('aria-pressed')).toBe('true')
    expect(discountInput()!.value).toBe('2')
    expect(taxPicker().textContent).toContain('VAT')
    expect(note().value).toBe('<p>gift</p>')
  })

  it('saves the edits all at once', async () => {
    await open()
    button('%').click()
    type(discountInput()!, '10')
    await pickTax('Low')
    type(note(), '<p>for <strong>Dara</strong></p>')
    await settle()
    expect(saved).toEqual([])

    await submit()
    expect(saved).toEqual([{ discountType: 'percent', discountValue: 10, taxRateId: 3, note: '<p>for <strong>Dara</strong></p>' }])
  })

  it('sends no rate for No tax', async () => {
    await open()
    await pickTax(t('tax.none'))
    await submit()
    expect(saved).toEqual([{ ...start, taxRateId: null }])
  })

  it('takes an empty or negative discount as none', async () => {
    await open()
    type(discountInput()!, '')
    await submit()
    type(discountInput()!, '-5')
    await submit()
    expect(saved.map((s) => s.discountValue)).toEqual([0, 0])
  })

  it('changes nothing on Cancel', async () => {
    await open()
    type(discountInput()!, '9')
    button(t('common.cancel')).click()
    await settle()
    expect(closed).toBe(1)
    expect(saved).toEqual([])
  })

  it('leaves the discount out for a cashier who can’t give one', async () => {
    await open({ canDiscount: false })
    expect(discountInput()).toBeNull()
    expect(host.textContent).not.toContain(t('pos.totalDiscount'))
    expect(taxPicker()).toBeTruthy()
    await submit()
    expect(saved).toEqual([start])
  })

  it('says it in Khmer', async () => {
    setLocale('km')
    await open()
    expect(host.querySelector('[role="dialog"]')!.getAttribute('aria-label')).toBe('បញ្ចុះតម្លៃ ពន្ធ និងកំណត់ចំណាំ')
    expect(host.querySelector('[data-rich-label]')!.textContent).toBe('កំណត់ចំណាំការលក់')
  })
})
