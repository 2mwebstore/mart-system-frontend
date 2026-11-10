import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue'
import { i18n, t } from '@/i18n'
import PasswordInput from './PasswordInput.vue'

let app: App | null = null
let host: HTMLElement
const typed = ref('')

function mount() {
  typed.value = ''
  host = document.createElement('div')
  document.body.appendChild(host)
  const Form = defineComponent(() => () =>
    h('form', [
      h(PasswordInput, {
        id: 'pw',
        modelValue: typed.value,
        'onUpdate:modelValue': (v: string) => (typed.value = v),
        autocomplete: 'current-password',
        required: true,
      }),
    ]),
  )
  app = createApp(Form).use(i18n)
  app.mount(host)
}

const field = () => host.querySelector<HTMLInputElement>('#pw')!
const toggle = () => host.querySelector<HTMLButtonElement>('button')!

afterEach(() => {
  app?.unmount()
  app = null
  host.remove()
})

describe('PasswordInput', () => {
  it('starts hidden, and the button shows the password and hides it again', async () => {
    mount()
    expect(field().type).toBe('password')
    expect(toggle().getAttribute('aria-label')).toBe(t('auth.showPassword'))
    expect(toggle().getAttribute('aria-pressed')).toBe('false')

    toggle().click()
    await nextTick()
    expect(field().type).toBe('text')
    expect(toggle().getAttribute('aria-label')).toBe(t('auth.hidePassword'))
    expect(toggle().getAttribute('aria-pressed')).toBe('true')

    toggle().click()
    await nextTick()
    expect(field().type).toBe('password')
    expect(toggle().getAttribute('aria-label')).toBe(t('auth.showPassword'))
  })

  it("keeps what was typed and the field's own attributes, and the button doesn't submit", async () => {
    mount()
    let submitted = false
    host.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault()
      submitted = true
    })
    field().value = 'typed-in'
    field().dispatchEvent(new Event('input'))
    await nextTick()
    expect(typed.value).toBe('typed-in')

    toggle().click()
    await nextTick()
    expect(field().value).toBe('typed-in')
    expect(field().autocomplete).toBe('current-password')
    expect(field().required).toBe(true)
    expect(toggle().type).toBe('button')
    expect(submitted).toBe(false)
  })
})
