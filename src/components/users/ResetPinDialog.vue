<script setup lang="ts">
// Reset POS PIN, from the Users list or a user's page. It asks first (the old
// PIN stops working at once), then shows the new one: only this once, since the
// server keeps just a hash of it.
import { ref } from 'vue'
import { KeyRound } from 'lucide-vue-next'
import * as peopleApi from '@/api/people'
import Modal from '@/components/Modal.vue'

const props = defineProps<{ userId: number; name: string }>()
const emit = defineEmits<{ close: [] }>()

const pin = ref<string | null>(null)
const busy = ref(false)

async function reset() {
  busy.value = true
  try {
    pin.value = (await peopleApi.resetUserPin(props.userId)).pin
  } catch {
    // toasted by the API client
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Modal :title="pin ? $t('users.newPinTitle') : $t('users.resetPinTitle')" @close="emit('close')">
    <div v-if="pin" class="space-y-4 text-center">
      <p class="text-sm text-muted">{{ $t('users.newPinBody', { name }) }}</p>
      <p class="font-mono text-4xl tracking-[0.4em]" data-new-pin>{{ pin }}</p>
      <button type="button" class="btn-primary" @click="emit('close')">{{ $t('common.done') }}</button>
    </div>
    <div v-else class="space-y-4">
      <p class="text-sm">{{ $t('users.resetPinConfirm', { name }) }}</p>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn-secondary" @click="emit('close')">{{ $t('common.cancel') }}</button>
        <button type="button" class="btn-primary flex items-center gap-2" :disabled="busy" @click="reset">
          <KeyRound :stroke-width="1.8" class="w-4 h-4" /> {{ $t('users.resetPin') }}
        </button>
      </div>
    </div>
  </Modal>
</template>
