<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import LanguageSwitch from '@/components/LanguageSwitch.vue'
import { apiErrorMessage } from '@/i18n/apiErrors'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

const username = ref('')
const password = ref('')
const errorMessage = ref('')
const submitting = ref(false)

async function handleSubmit() {
  errorMessage.value = ''
  submitting.value = true
  try {
    await auth.login(username.value, password.value)
    router.push({ name: 'dashboard' })
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'auth.invalidCredentials')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-page px-4">
    <div class="w-full max-w-sm">
      <div class="text-center mb-6">
        <h1 class="font-heading text-2xl text-ink">{{ t('app.name') }}</h1>
      </div>

      <form class="card space-y-4" @submit.prevent="handleSubmit">
        <h2 class="font-heading text-lg">{{ t('auth.signIn') }}</h2>

        <div>
          <label for="username" class="block text-sm text-muted mb-1">{{ t('auth.username') }}</label>
          <input id="username" v-model="username" type="text" class="input" autocomplete="username" required />
        </div>

        <div>
          <label for="password" class="block text-sm text-muted mb-1">{{ t('auth.password') }}</label>
          <input
            id="password"
            v-model="password"
            type="password"
            class="input"
            autocomplete="current-password"
            required
          />
        </div>

        <p v-if="errorMessage" class="text-sm text-danger-strong" role="alert">{{ errorMessage }}</p>

        <button type="submit" class="btn-primary w-full" :disabled="submitting">
          {{ t('auth.signInCta') }}
        </button>
      </form>

      <div class="flex justify-center mt-4">
        <LanguageSwitch />
      </div>
    </div>
  </div>
</template>
