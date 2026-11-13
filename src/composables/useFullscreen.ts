import { onBeforeUnmount, onMounted, ref } from 'vue'

// Puts the whole page in full screen (the POS and the customer display), and
// follows it in and out — Esc leaves full screen without the button. Browsers
// that can't (Safari on iPhone) say so in `supported`, so the button can hide.
export function useFullscreen() {
  const supported = !!document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === 'function'
  const isFullscreen = ref(!!document.fullscreenElement)
  const sync = () => void (isFullscreen.value = !!document.fullscreenElement)

  // A refusal (no click behind it, or the browser said no) is left alone.
  function enter() {
    if (!document.fullscreenElement) void Promise.resolve(document.documentElement.requestFullscreen?.()).catch(() => {})
  }
  function exit() {
    if (document.fullscreenElement) void Promise.resolve(document.exitFullscreen?.()).catch(() => {})
  }
  function toggle() {
    if (document.fullscreenElement) exit()
    else enter()
  }

  onMounted(() => {
    sync()
    document.addEventListener('fullscreenchange', sync)
  })
  onBeforeUnmount(() => document.removeEventListener('fullscreenchange', sync))

  return { supported, isFullscreen, enter, exit, toggle }
}
