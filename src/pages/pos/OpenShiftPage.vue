<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useShiftStore } from '@/stores/shift'
import { formatUSD, formatKHR } from '@/utils/format'
import { useToast } from '@/composables/useToast'
import LanguageSwitch from '@/components/LanguageSwitch.vue'
import { t } from '@/i18n'

const auth = useAuthStore()
const shift = useShiftStore()
const router = useRouter()
const toast = useToast()

const usdAmount = ref(0)
const khrAmount = ref(0)
const submitting = ref(false)

async function startShift() {
  submitting.value = true
  try {
    await shift.openShift(Math.round((usdAmount.value || 0) * 100), Math.round(khrAmount.value || 0))
    toast.success(t('shifts.shiftOpened', { till: auth.tillName }))
    router.push({ name: 'pos' })
  } catch {
    // the API client already toasted the reason
  } finally {
    submitting.value = false
  }
}

async function switchUser() {
  await auth.logout()
  router.push({ name: 'pos-login' })
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-page px-4">
    <div class="w-full max-w-md space-y-4">
      <div class="text-center">
        <h1 class="font-heading text-2xl text-ink">{{ auth.tillName }}</h1>
        <p class="text-muted text-sm mt-1">{{ $t('pos.noShiftOpen', { name: auth.user?.full_name }) }}</p>
      </div>

      <div class="card space-y-4">
        <h2 class="font-heading text-lg">{{ $t('shifts.openShift') }}</h2>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm text-muted mb-1">{{ $t('shifts.amountUsd') }}</label>
            <input v-model.number="usdAmount" type="number" min="0" step="0.01" class="input text-lg" autofocus />
          </div>
          <div>
            <label class="block text-sm text-muted mb-1">{{ $t('shifts.amountKhr') }}</label>
            <input v-model.number="khrAmount" type="number" min="0" step="100" class="input text-lg" />
          </div>
        </div>
        <p class="text-xs text-muted">{{ $t('pos.openingFloat', { usd: formatUSD((usdAmount || 0) * 100), khr: formatKHR(khrAmount || 0) }) }}</p>
        <button type="button" class="btn-primary w-full text-lg py-3" :disabled="submitting" @click="startShift">{{ $t('shifts.startShift') }}</button>
      </div>

      <div class="flex justify-center"><LanguageSwitch /></div>

      <button type="button" class="text-sm text-muted hover:text-ink block mx-auto" @click="switchUser">
        {{ $t('shifts.notYou') }}
      </button>
    </div>
  </div>
</template>
