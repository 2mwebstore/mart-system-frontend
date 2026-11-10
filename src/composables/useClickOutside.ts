import { onBeforeUnmount, onMounted, type Ref } from 'vue'

// Calls `handler` on a press anywhere outside `target` — closes a dropdown.
export function useClickOutside(target: Ref<HTMLElement | null>, handler: () => void) {
  const listener = (e: PointerEvent) => {
    const el = target.value
    if (el && !el.contains(e.target as Node)) handler()
  }
  onMounted(() => document.addEventListener('pointerdown', listener))
  onBeforeUnmount(() => document.removeEventListener('pointerdown', listener))
}
