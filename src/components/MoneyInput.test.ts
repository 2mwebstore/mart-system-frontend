import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
import MoneyInput from './MoneyInput.vue'

let app: App | null = null
let model: ReturnType<typeof ref<number>>

async function mount(currency: 'USD' | 'KHR', start = 0, attrs: Record<string, unknown> = {}) {
  model = ref(start)
  const host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({
    render: () => h(MoneyInput, { currency, modelValue: model.value, 'onUpdate:modelValue': (n: number) => (model.value = n), ...attrs }),
  })
  app.mount(host)
  await nextTick()
  return host.querySelector<HTMLInputElement>('input')!
}

// Typing: the box's text becomes `value` with the caret at `caret` (the end
// by default), as the browser hands it over before the box tidies it.
async function type(el: HTMLInputElement, value: string, caret = value.length) {
  el.value = value
  el.setSelectionRange(caret, caret)
  el.dispatchEvent(new Event('input'))
  await nextTick()
}

afterEach(() => {
  app?.unmount()
  app = null
  document.body.innerHTML = ''
})

describe('a cash amount box', () => {
  it('shows an amount as money, with its sign', async () => {
    const usd = await mount('USD', 1250.5)
    expect(usd.value).toBe('1,250.50')
    expect(usd.parentElement!.textContent).toContain('$')
    app!.unmount()
    const khr = await mount('KHR', 50000)
    expect(khr.value).toBe('50,000')
    expect(khr.parentElement!.textContent).toContain('៛')
  })

  it('starts empty instead of 0, so there is nothing to delete first', async () => {
    const el = await mount('USD')
    expect(el.value).toBe('')
    expect(el.placeholder).toBe('0.00')
  })

  it('puts the thousands marks in as you type', async () => {
    const el = await mount('KHR')
    await type(el, '5')
    await type(el, '50000')
    expect(el.value).toBe('50,000')
    expect(model.value).toBe(50000)
    await type(el, '50,0000')
    expect(el.value).toBe('500,000')
    expect(model.value).toBe(500000)
  })

  it('keeps dollars to cents, and shows them in full when done', async () => {
    const el = await mount('USD')
    await type(el, '1250.567')
    expect(el.value).toBe('1,250.56')
    expect(model.value).toBe(1250.56)
    await type(el, '12.5')
    expect(el.value).toBe('12.5') // left as typed while typing
    el.dispatchEvent(new Event('blur'))
    await nextTick()
    expect(el.value).toBe('12.50')
    expect(model.value).toBe(12.5)
  })

  it('takes only digits (and one point for dollars)', async () => {
    const khr = await mount('KHR')
    await type(khr, '5a0.0-')
    expect(khr.value).toBe('500')
    expect(model.value).toBe(500)
    app!.unmount()
    const usd = await mount('USD')
    await type(usd, '1.2.3')
    expect(usd.value).toBe('1.23')
    await type(usd, '.5')
    expect(usd.value).toBe('0.5')
    await type(usd, '007')
    expect(usd.value).toBe('7')
  })

  it('is 0 when emptied', async () => {
    const el = await mount('USD', 20)
    await type(el, '')
    expect(model.value).toBe(0)
  })

  it('keeps the caret where you were typing', async () => {
    const el = await mount('KHR', 1234)
    // A 5 typed after the 1 in "1,234".
    await type(el, '15,234', 2)
    expect(el.value).toBe('15,234')
    expect(el.selectionStart).toBe(2)
    // A 6 typed at the end: the mark moves, the caret stays at the end.
    await type(el, '15,2346')
    expect(el.value).toBe('152,346')
    expect(el.selectionStart).toBe(7)
    // A 9 typed after the 2 in "152,346": the mark moves left of the caret,
    // which stays after the 9.
    await type(el, '1529,346', 4)
    expect(el.value).toBe('1,529,346')
    expect(el.selectionStart).toBe(5)
    // In the middle, as the first mark comes in: "123" with a 4 after the 1.
    await type(el, '', 0)
    await type(el, '123')
    await type(el, '1423', 2)
    expect(el.value).toBe('1,423')
    expect(el.selectionStart).toBe(3)
  })

  it('throws out a letter typed into an amount, leaving it as it was', async () => {
    const el = await mount('KHR', 500)
    await type(el, '50a0', 3)
    expect(el.value).toBe('500')
    expect(el.selectionStart).toBe(2)
    expect(model.value).toBe(500)
  })

  it('shows an amount set from outside, like Exact or +$5', async () => {
    const el = await mount('USD')
    model.value = 3.4
    await nextTick()
    expect(el.value).toBe('3.40')
    model.value = 0
    await nextTick()
    expect(el.value).toBe('')
  })

  it('selects the amount on focus, ready to type over', async () => {
    const el = await mount('KHR', 8200)
    el.dispatchEvent(new Event('focus'))
    expect([el.selectionStart, el.selectionEnd]).toEqual([0, 5])
  })

  it('opens the number keypad, and passes its attributes to the box', async () => {
    const usd = await mount('USD', 0, { class: 'text-lg', id: 'tender-usd' })
    expect(usd.type).toBe('text')
    expect(usd.inputMode).toBe('decimal')
    expect(usd.id).toBe('tender-usd')
    expect(usd.classList).toContain('text-lg')
    expect(usd.classList).toContain('input')
    expect(usd.parentElement!.id).toBe('')
    app!.unmount()
    const khr = await mount('KHR')
    expect(khr.inputMode).toBe('numeric')
  })
})
