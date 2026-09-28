<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { listPublicTills } from '@/api/settings'
import NumPad from '@/components/pos/NumPad.vue'
import LanguageSwitch from '@/components/LanguageSwitch.vue'
import { t } from '@/i18n'
import { apiErrorMessage } from '@/i18n/apiErrors'
import type { PublicTill } from '@/types/domain'

const auth = useAuthStore()
const router = useRouter()

// Active tills come from the server (public endpoint — nobody is signed in yet).
const activeTills = ref<PublicTill[]>([])
const deviceKey = ref(auth.deviceKey)
onMounted(async () => {
  try {
    activeTills.value = await listPublicTills()
    if (!activeTills.value.some((x) => x.deviceKey === deviceKey.value)) deviceKey.value = activeTills.value[0]?.deviceKey ?? ''
  } catch {
    errorMessage.value = t('pos.tillsLoadFailed')
  }
})
const username = ref('')
const pin = ref('')
const errorMessage = ref('')
const submitting = ref(false)

const tillName = computed(() => activeTills.value.find((x) => x.deviceKey === deviceKey.value)?.name ?? '')

async function handleSubmit() {
  errorMessage.value = ''
  if (!username.value || pin.value.length !== 4) {
    errorMessage.value = t('pos.enterUserPin')
    return
  }
  submitting.value = true
  try {
    await auth.pinLogin(deviceKey.value, tillName.value, username.value.trim(), pin.value)
    router.push({ name: 'pos' })
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'pos.invalidPin')
    pin.value = ''
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-page px-4">
    <div class="w-full max-w-sm space-y-5">
      <div class="text-center">
        <h1 class="font-heading text-2xl text-ink">{{ $t('pos.signInTitle') }}</h1>
        <p class="text-muted text-sm mt-1">{{ $t('pos.signInSubtitle') }}</p>
      </div>

      <form class="card space-y-4" @submit.prevent="handleSubmit">
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('common.till') }}</label>
          <select v-model="deviceKey" class="input">
            <option v-for="till in activeTills" :key="till.deviceKey" :value="till.deviceKey">{{ till.name }}</option>
          </select>
        </div>

        <div>
          <label for="username" class="block text-sm text-muted mb-1">{{ $t('auth.username') }}</label>
          <input id="username" v-model="username" type="text" class="input" autocomplete="username" :placeholder="$t('pos.usernameHint')" required />
        </div>

        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('pos.pin') }}</label>
          <div class="flex items-center justify-center gap-3 py-2">
            <span
              v-for="i in 4"
              :key="i"
              class="w-3.5 h-3.5 rounded-full border border-primary"
              :class="pin.length >= i ? 'bg-primary' : 'bg-transparent'"
            />
          </div>
          <NumPad v-model="pin" :max-length="4" />
        </div>

        <p v-if="errorMessage" class="text-sm text-danger-strong text-center" role="alert">{{ errorMessage }}</p>

        <button type="submit" class="btn-primary w-full" :disabled="submitting">
          {{ submitting ? $t('pos.signingIn') : $t('pos.signIn') }}
        </button>
      </form>

      <div class="flex justify-center"><LanguageSwitch /></div>

      <RouterLink :to="{ name: 'login' }" class="text-sm text-muted hover:text-ink block text-center">
        {{ $t('pos.backOfficeSignIn') }}
      </RouterLink>
    </div>
  </div>
</template>
