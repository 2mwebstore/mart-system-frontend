import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { i18n, setLocale, t } from '@/i18n'
import { useInUseAlert } from '@/composables/useInUseAlert'
import type { InUseInfo } from '@/utils/inUse'
import InUseAlert from './InUseAlert.vue'

const tea: InUseInfo = {
  entity: 'product',
  name: 'Tea',
  nameKm: 'តែក្រូចឆ្មា',
  uses: [
    { what: 'sales', count: 12 },
    { what: 'invoices', count: 1 },
  ],
  hint: 'switch_off',
}
const drinks: InUseInfo = { entity: 'category', name: 'Drinks', uses: [{ what: 'products', count: 4 }], hint: 'move_products' }

let app: App | null = null
let host: HTMLElement

beforeEach(() => {
  setLocale('en')
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(InUseAlert).use(i18n)
  app.mount(host)
})
afterEach(() => {
  useInUseAlert().close()
  app?.unmount()
  app = null
  document.body.innerHTML = ''
})

const uses = (root: ParentNode = document) => [...root.querySelectorAll('[data-use]')].map((li) => li.textContent?.trim())

describe('the in-use alert', () => {
  it('shows nothing until a delete is refused', () => {
    expect(document.querySelector('[data-in-use-alert]')).toBeNull()
  })

  it('names the record, what uses it, and what to do instead', async () => {
    useInUseAlert().show([tea])
    await nextTick()
    expect(document.body.textContent).toContain(t('inUse.title', { what: 'product “Tea”' }))
    expect(uses()).toEqual(['12 POS sales', '1 invoice'])
    expect(document.body.textContent).toContain(t('inUse.hint.switch_off'))
    expect(document.body.textContent).toContain(t('inUse.why'))
  })

  it('uses the Khmer name in Khmer', async () => {
    setLocale('km')
    useInUseAlert().show([tea])
    await nextTick()
    expect(document.body.textContent).toContain('“តែក្រូចឆ្មា”')
    expect(document.body.textContent).not.toContain('Tea')
    expect(document.body.textContent).toContain(t('inUse.what.sales', { n: 12 }, 12))
  })

  it('lists each refused record of a bulk delete', async () => {
    useInUseAlert().show([tea, drinks])
    await nextTick()
    expect(document.body.textContent).toContain(t('inUse.titleMany', { n: 2 }))
    const sections = [...document.querySelectorAll('[data-in-use]')]
    expect(sections.map((s) => s.getAttribute('data-in-use'))).toEqual(['product', 'category'])
    expect(uses(sections[1])).toEqual(['4 products'])
    expect(sections[1].textContent).toContain('category “Drinks”')
    expect(sections[1].textContent).toContain(t('inUse.hint.move_products'))
  })

  it('still says something for a use or record it has no words for', async () => {
    useInUseAlert().show([{ entity: 'gadget', name: 'Thing', uses: [{ what: 'gift_cards', count: 2 }] }])
    await nextTick()
    expect(uses()).toEqual(['2 gift cards'])
    expect(document.body.textContent).toContain('“Thing”')
  })

  it('closes on OK', async () => {
    useInUseAlert().show([tea])
    await nextTick()
    document.querySelector<HTMLButtonElement>('[data-action="in-use-ok"]')!.click()
    await nextTick()
    expect(document.querySelector('[data-in-use-alert]')).toBeNull()
    expect(useInUseAlert().shown.value).toEqual([])
  })

  it('ignores an empty list', async () => {
    useInUseAlert().show([tea])
    useInUseAlert().show([])
    await nextTick()
    expect(uses()).toEqual(['12 POS sales', '1 invoice'])
  })
})
