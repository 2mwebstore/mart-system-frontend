<script setup lang="ts">
import { reactive, ref } from 'vue'
import Modal from '@/components/Modal.vue'
import { useShiftStore } from '@/stores/shift'
import { useToast } from '@/composables/useToast'
import { label, t } from '@/i18n'

const shift = useShiftStore()
const toast = useToast()
const emit = defineEmits<{ close: [] }>()

const type = ref<'PAYOUT' | 'PAYIN'>('PAYOUT')
const form = reactive({ amountUSD: 0, amountKHR: 0, reason: '' })

const saving = ref(false)

async function submit() {
  if (!form.reason.trim()) {
    toast.error(t('shifts.enterReason'))
    return
  }
  const usdCents = Math.round((form.amountUSD || 0) * 100)
  const khrRiel = Math.round(form.amountKHR || 0)
  if (usdCents <= 0 && khrRiel <= 0) {
    toast.error(t('shifts.enterAmount'))
    return
  }
  saving.value = true
  try {
    await shift.addCashMovement(type.value, usdCents, khrRiel, form.reason.trim())
    toast.success(t('shifts.movementRecorded', { kind: label('movementDir', type.value) }))
    emit('close')
  } catch {
    // the API client already toasted the reason
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Modal :title="$t('pos.cashMovementTitle')" @close="emit('close')">
    <form class="space-y-4" @submit.prevent="submit">
      <div class="flex rounded-control border border-line overflow-hidden">
        <button
          type="button"
          class="flex-1 py-2 text-sm font-medium"
          :class="type === 'PAYOUT' ? 'bg-primary text-primary-ink' : 'bg-surface text-muted hover:text-ink'"
          @click="type = 'PAYOUT'"
        >
          {{ $t('movementDir.PAYOUT') }}
        </button>
        <button
          type="button"
          class="flex-1 py-2 text-sm font-medium"
          :class="type === 'PAYIN' ? 'bg-primary text-primary-ink' : 'bg-surface text-muted hover:text-ink'"
          @click="type = 'PAYIN'"
        >
          {{ $t('movementDir.PAYIN') }}
        </button>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('shifts.amountUsd') }}</label>
          <input v-model.number="form.amountUSD" type="number" min="0" step="0.01" class="input" />
        </div>
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('shifts.amountKhr') }}</label>
          <input v-model.number="form.amountKHR" type="number" min="0" step="100" class="input" />
        </div>
      </div>
      <div>
        <label class="block text-sm text-muted mb-1">{{ $t('common.reason') }}</label>
        <input v-model="form.reason" type="text" class="input" required />
      </div>
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" class="btn-secondary" @click="emit('close')">{{ $t('common.cancel') }}</button>
        <button type="submit" class="btn-primary" :disabled="saving">{{ $t('common.save') }}</button>
      </div>
    </form>
  </Modal>
</template>
