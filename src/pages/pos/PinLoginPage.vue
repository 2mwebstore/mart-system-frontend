<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useBrandingStore } from '@/stores/branding'
import { listPublicTills } from '@/api/settings'
import { getAccessToken } from '@/api/tokens'
import NumPad from '@/components/pos/NumPad.vue'
import LanguageSwitch from '@/components/LanguageSwitch.vue'
import BrandLogo from '@/components/BrandLogo.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import { t } from '@/i18n'
import { apiErrorMessage } from '@/i18n/apiErrors'
import type { PublicTill } from '@/types/domain'

const auth = useAuthStore()
const branding = useBrandingStore()
const router = useRouter()

// Active tills come from the server (public endpoint — nobody may be signed in yet).
const activeTills = ref<PublicTill[]>([])
const deviceKey = ref(auth.deviceKey)
const loading = ref(true)
// Already signed in (e.g. from the back office) with pos.sell: no second
// sign-in, just pick a till. "Use a PIN" switches to the cashier sign-in.
const usePin = ref(false)
const sessionMode = computed(() => auth.canUsePos && !usePin.value)

onMounted(async () => {
  try {
    if (getAccessToken() && !auth.isAuthenticated) {
      try {
        await auth.fetchMe()
      } catch {
        // no usable session — the PIN form below is the way in
      }
    }
    activeTills.value = await listPublicTills()
  } catch {
    errorMessage.value = t('pos.tillsLoadFailed')
  } finally {
    loading.value = false
    pickDefaultTill()
  }
})

// A session can only use tills in its own branches; the PIN form lists every
// active till (the server checks the cashier's branch on sign-in).
const shownTills = computed(() => {
  if (!sessionMode.value) return activeTills.value
  const allowed = new Set(auth.branches.map((b) => b.id))
  return activeTills.value.filter((x) => allowed.has(x.branchId))
})
function tillLabel(x: PublicTill) {
  return x.branchName ? `${x.name} · ${x.branchName}` : x.name
}
const tillOptions = computed(() => shownTills.value.map((x) => ({ value: x.deviceKey, label: tillLabel(x) })))
const selectedTill = computed(() => shownTills.value.find((x) => x.deviceKey === deviceKey.value))
const tillName = computed(() => (selectedTill.value ? tillLabel(selectedTill.value) : ''))

function pickDefaultTill() {
  if (shownTills.value.some((x) => x.deviceKey === deviceKey.value)) return
  // Prefer a till in the back office's active branch, then any allowed one.
  const inActive = shownTills.value.find((x) => x.branchId === auth.activeBranchId)
  deviceKey.value = (inActive ?? shownTills.value[0])?.deviceKey ?? ''
}

const username = ref('')
const pin = ref('')
const errorMessage = ref('')
const submitting = ref(false)

function setTill(v: string | number | null) {
  deviceKey.value = v === null ? '' : String(v)
}

function openWithSession() {
  errorMessage.value = ''
  if (!selectedTill.value) {
    errorMessage.value = t('pos.pickTill')
    return
  }
  auth.selectTill(deviceKey.value, tillName.value)
  router.push({ name: 'pos' })
}

function switchToPin() {
  usePin.value = true
  errorMessage.value = ''
  pickDefaultTill()
}
function switchToSession() {
  usePin.value = false
  errorMessage.value = ''
  pickDefaultTill()
}

async function handleSubmit() {
  errorMessage.value = ''
  if (!deviceKey.value) {
    errorMessage.value = t('pos.pickTill')
    return
  }
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
        <BrandLogo class="h-16 max-w-[12rem] mb-2" />
        <h1 class="font-heading text-2xl text-ink">{{ $t('pos.signInTitle', { brand: branding.shortName }) }}</h1>
        <p class="text-muted text-sm mt-1">{{ sessionMode ? $t('pos.chooseTillSubtitle') : $t('pos.signInSubtitle') }}</p>
      </div>

      <!-- Signed in already: pick a till and go -->
      <div v-if="sessionMode" class="card space-y-4">
        <p class="text-sm">{{ $t('pos.signedInAs', { name: auth.user?.full_name }) }}</p>
        <SearchableSelect
          :model-value="deviceKey || null"
          :label="$t('common.till')"
          :options="tillOptions"
          :clearable="false"
          :placeholder="$t('pos.pickTill')"
          @update:model-value="setTill"
        />
        <p v-if="!loading && tillOptions.length === 0" class="text-sm text-muted">{{ $t('pos.noTillsForYou') }}</p>
        <p v-if="errorMessage" class="text-sm text-danger-strong text-center" role="alert">{{ errorMessage }}</p>
        <button type="button" class="btn-primary w-full" :disabled="!selectedTill" @click="openWithSession">{{ $t('pos.openPos') }}</button>
        <button type="button" class="text-sm text-muted hover:text-ink block mx-auto" @click="switchToPin">{{ $t('pos.usePinInstead') }}</button>
      </div>

      <!-- Cashier PIN sign-in -->
      <form v-else class="card space-y-4" @submit.prevent="handleSubmit">
        <SearchableSelect
          :model-value="deviceKey || null"
          :label="$t('common.till')"
          :options="tillOptions"
          :clearable="false"
          :placeholder="$t('pos.pickTill')"
          @update:model-value="setTill"
        />

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
        <button v-if="auth.canUsePos" type="button" class="text-sm text-muted hover:text-ink block mx-auto" @click="switchToSession">
          {{ $t('pos.continueAs', { name: auth.user?.full_name }) }}
        </button>
      </form>

      <div class="flex justify-center"><LanguageSwitch /></div>

      <RouterLink :to="{ name: auth.isAuthenticated ? 'dashboard' : 'login' }" class="text-sm text-muted hover:text-ink block text-center">
        {{ auth.isAuthenticated ? $t('pos.backOffice') : $t('pos.backOfficeSignIn') }}
      </RouterLink>
    </div>
  </div>
</template>
