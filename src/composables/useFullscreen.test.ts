import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { useFullscreen } from './useFullscreen'

// jsdom has no full screen, so this stands in for the browser's: entering and
// leaving fire `fullscreenchange`, as a browser does (Esc included).
let fullscreenEl: Element | null
let refuse: boolean
const request = vi.fn()
const exitFs = vi.fn()
function change(to: Element | null) {
  fullscreenEl = to
  document.dispatchEvent(new Event('fullscreenchange'))
}
function browserCanGoFullscreen(can = true) {
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: can })
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenEl })
  Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: request })
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exitFs })
}

beforeEach(() => {
  fullscreenEl = null
  refuse = false
  request.mockReset().mockImplementation(async () => {
    if (refuse) throw new TypeError('Permissions check failed')
    change(document.documentElement)
  })
  exitFs.mockReset().mockImplementation(async () => change(null))
})

let app: App | null = null
afterEach(() => {
  app?.unmount()
  app = null
  for (const key of ['fullscreenEnabled', 'fullscreenElement', 'exitFullscreen']) delete (document as unknown as Record<string, unknown>)[key]
  delete (document.documentElement as unknown as Record<string, unknown>).requestFullscreen
})

function mountFullscreen() {
  let fs!: ReturnType<typeof useFullscreen>
  app = createApp({
    setup() {
      fs = useFullscreen()
      return () => null
    },
  })
  app.mount(document.createElement('div'))
  return fs
}

describe('full screen for the POS and the customer display', () => {
  it('says when the browser has no full screen, so the button can hide', () => {
    expect(mountFullscreen().supported).toBe(false)
    app!.unmount()
    browserCanGoFullscreen(false)
    expect(mountFullscreen().supported).toBe(false)
  })

  it('puts the whole page in full screen and the same button takes it out', async () => {
    browserCanGoFullscreen()
    const fs = mountFullscreen()
    expect(fs.supported).toBe(true)
    expect(fs.isFullscreen.value).toBe(false)

    fs.toggle()
    await nextTick()
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.contexts[0]).toBe(document.documentElement)
    expect(fs.isFullscreen.value).toBe(true)

    fs.toggle()
    await nextTick()
    expect(exitFs).toHaveBeenCalledTimes(1)
    expect(fs.isFullscreen.value).toBe(false)
  })

  it('follows the browser when Esc leaves full screen', async () => {
    browserCanGoFullscreen()
    const fs = mountFullscreen()
    fs.enter()
    await nextTick()
    expect(fs.isFullscreen.value).toBe(true)

    change(null)
    expect(fs.isFullscreen.value).toBe(false)
    // So the next press goes back in, not out.
    fs.toggle()
    await nextTick()
    expect(request).toHaveBeenCalledTimes(2)
    expect(exitFs).not.toHaveBeenCalled()
  })

  it('knows the page is already full screen when it opens', () => {
    browserCanGoFullscreen()
    fullscreenEl = document.documentElement
    const fs = mountFullscreen()
    expect(fs.isFullscreen.value).toBe(true)
    fs.enter()
    expect(request).not.toHaveBeenCalled()
  })

  it('does nothing when the browser refuses', async () => {
    browserCanGoFullscreen()
    refuse = true
    const fs = mountFullscreen()
    fs.enter()
    await nextTick()
    await Promise.resolve()
    expect(request).toHaveBeenCalledTimes(1)
    expect(fs.isFullscreen.value).toBe(false)
    fs.exit()
    expect(exitFs).not.toHaveBeenCalled()
  })

  it('stops following full screen once the page closes', () => {
    browserCanGoFullscreen()
    const fs = mountFullscreen()
    app!.unmount()
    app = null
    change(document.documentElement)
    expect(fs.isFullscreen.value).toBe(false)
  })
})
