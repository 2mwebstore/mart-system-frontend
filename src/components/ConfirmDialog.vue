<script setup lang="ts">
// An "are you sure?" popup in the app's own look, in place of the browser's
// confirm() and prompt() boxes: a title, what will happen, then Cancel and
// the action. With reasonLabel it also asks why (a void's reason), and sends
// it with confirm. Opened over another popup (held sales, this shift's
// sales) it sits on top of it, and Esc closes only this one.
import { onMounted, onUnmounted, ref } from 'vue'
import Modal from '@/components/Modal.vue'

const props = withDefaults(
  defineProps<{
    title: string
    message?: string
    confirmLabel: string
    danger?: boolean
    reasonLabel?: string
    reasonPlaceholder?: string
    busy?: boolean
  }>(),
  { message: '', danger: true, reasonLabel: '', reasonPlaceholder: '', busy: false },
)
const emit = defineEmits<{ close: []; confirm: [reason: string] }>()

const reason = ref('')
const reasonRef = ref<HTMLTextAreaElement | null>(null)
const cancelRef = ref<HTMLButtonElement | null>(null)

function confirm() {
  if (!props.busy) emit('confirm', reason.value.trim())
}
function close() {
  if (!props.busy) emit('close')
}

// Caught before any popup underneath sees it, so Esc doesn't close that too.
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  e.stopPropagation()
  close()
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown, true)
  // The reason box when there is one; otherwise Cancel, the safe choice.
  ;(reasonRef.value ?? cancelRef.value)?.focus()
})
onUnmounted(() => window.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <Teleport to="body">
    <Modal :title="title" @close="close">
      <form class="space-y-4" data-confirm-dialog @submit.prevent="confirm">
        <p v-if="message" class="text-sm text-muted">{{ message }}</p>
        <div v-if="reasonLabel">
          <label for="confirm-reason" class="block text-sm text-muted mb-1">{{ reasonLabel }}</label>
          <textarea
            id="confirm-reason"
            ref="reasonRef"
            v-model="reason"
            rows="3"
            maxlength="255"
            class="input"
            :placeholder="reasonPlaceholder"
            :disabled="busy"
          />
        </div>
        <div class="flex justify-end gap-2 pt-1">
          <button ref="cancelRef" type="button" class="btn-secondary" :disabled="busy" @click="close">{{ $t('common.cancel') }}</button>
          <button type="submit" :class="danger ? 'btn-danger' : 'btn-primary'" :disabled="busy" data-confirm>{{ confirmLabel }}</button>
        </div>
      </form>
    </Modal>
  </Teleport>
</template>
