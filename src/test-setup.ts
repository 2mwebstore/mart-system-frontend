// Recent Node versions define their own localStorage global, which is undefined
// unless Node is started with a storage file. It hides the jsdom one that the app
// and its tests expect, so put jsdom's back.
const { jsdom } = globalThis as unknown as { jsdom: { window: Window } }

Object.defineProperty(globalThis, 'localStorage', {
  value: jsdom.window.localStorage,
  configurable: true,
  writable: true,
})
