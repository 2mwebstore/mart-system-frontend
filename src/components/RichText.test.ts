import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, type App } from 'vue'
import RichText from './RichText.vue'

let app: App | null = null

function render(html: string | null) {
  const host = document.createElement('div')
  app = createApp({ render: () => h(RichText, { html }) })
  app.mount(host)
  return host
}

afterEach(() => {
  app?.unmount()
  app = null
})

describe('RichText', () => {
  const attacks: Record<string, string> = {
    'a script tag': '<script>alert(1)</script>',
    'an img onerror': '<img src=x onerror=alert(1)>',
    'an svg onload': '<svg onload=alert(1)></svg>',
    'a javascript: link': '<a href="javascript:alert(1)">x</a>',
    'a data: link': '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    'an inline handler': '<p onclick="alert(1)">x</p>',
    'an iframe': '<iframe src="https://evil.example"></iframe>',
    'a style attribute': '<p style="background:url(javascript:alert(1))">x</p>',
  }

  for (const [name, html] of Object.entries(attacks)) {
    it(`removes ${name}`, () => {
      const out = render(html).innerHTML.toLowerCase()
      for (const bad of ['<script', 'onerror', 'onload', 'onclick', 'javascript:', 'data:text', '<iframe', 'style=']) {
        expect(out).not.toContain(bad)
      }
    })
  }

  it('keeps the formatting it allows', () => {
    const out = render('<p><strong>bold</strong> <a href="https://example.com">link</a></p>').innerHTML
    expect(out).toContain('<strong>bold</strong>')
    expect(out).toContain('href="https://example.com"')
  })

  it('only lets links go to web and mail addresses', () => {
    expect(render('<a href="mailto:a@example.com">x</a>').innerHTML).toContain('href="mailto:a@example.com"')
    for (const href of ['ftp://example.com/x', 'tel:012345678', 'sms:012345678']) {
      expect(render(`<a href="${href}">x</a>`).innerHTML).not.toContain('href=')
    }
  })

  it('shows plain text as it was typed and keeps its line breaks', () => {
    const host = render('<!-- a note --> & more\nsecond line')
    expect(host.textContent).toBe('<!-- a note --> & moresecond line')
    expect(host.innerHTML).toContain('<br>')
  })

  it('shows nothing for an empty note', () => {
    expect(render(null).textContent).toBe('')
  })
})
