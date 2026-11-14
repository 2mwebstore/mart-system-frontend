import { afterEach, describe, expect, it } from 'vitest'
import { createApp, type App } from 'vue'
import BankNote from './BankNote.vue'

let app: App | null = null

function mount(currency: 'USD' | 'KHR', amount: number) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(BankNote, { currency, amount })
  app.mount(host)
  return host
}

afterEach(() => {
  app?.unmount()
  app = null
  document.body.innerHTML = ''
})

describe('BankNote', () => {
  it('shows the photo of a riel note, a little taller than a dollar note', () => {
    const riel = mount('KHR', 20000).querySelector<HTMLImageElement>('img[data-note-photo]')!
    expect(riel.getAttribute('src')).toMatch(/khr-20000\.jpg/)
    expect(riel.className).toContain('aspect-[11/5]')
    app!.unmount()
    const dollar = mount('USD', 20).querySelector<HTMLImageElement>('img[data-note-photo]')!
    expect(dollar.getAttribute('src')).toMatch(/usd-20\.jpg/)
    expect(dollar.className).toContain('aspect-[47/20]')
  })

  it('draws a note it has no photo of, with its value in the middle', () => {
    const host = mount('KHR', 500)
    expect(host.querySelector('[data-note-photo]')).toBeNull()
    expect(host.querySelector('[data-note-drawn] .rounded-full')!.textContent!.trim()).toBe('៛500')
  })
})
