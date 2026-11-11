<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useBrandingStore } from '@/stores/branding'
import { listPublicTills } from '@/api/settings'
import { getAccessToken } from '@/api/tokens'
import { getCompanyCode, normaliseCompanyCode, setCompanyCode } from '@/api/companyCode'
import NumPad from '@/components/pos/NumPad.vue'
import LanguageSwitch from '@/components/LanguageSwitch.vue'
import BrandLogo from '@/components/BrandLogo.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import { t } from '@/i18n'
import { apiErrorMessage } from '@/i18n/apiErrors'
import type { PublicTill } from '@/types/domain'
import type { AxiosError } from 'axios'

const auth = useAuthStore()
const branding = useBrandingStore()
const router = useRouter()

// Active tills come from the server (public endpoint — nobody may be signed in
// yet), one company's at a time: the till asks for the company's code once
// and remembers it, so the next cashier goes straight to the PIN.
const activeTills = ref<PublicTill[]>([])
const deviceKey = ref(auth.deviceKey)
const loading = ref(true)
// Already signed in (e.g. from the back office) with pos.sell: no second
// sign-in, just pick a till. "Use a PIN" switches to the cashier sign-in.
const usePin = ref(false)
const sessionMode = computed(() => auth.canUsePos && !usePin.value)

// The company whose tills are listed; '' until a code is known to be good.
const companyCode = ref('')
const codeInput = ref('')
const askCode = computed(() => !loading.value && !companyCode.value && !sessionMode.value)

onMounted(async () => {
  if (getAccessToken() && !auth.isAuthenticated) {
    try {
      await auth.fetchMe()
    } catch {
      // no usable session — the PIN form below is the way in
    }
  }
  // Signed in already: the user's own company. Otherwise the one this till
  // remembers, if any.
  const code = auth.company?.code ?? getCompanyCode()
  if (code) await loadTills(code)
  loading.value = false
  pickDefaultTill()
})

// Lists the company's tills; a code the server doesn't know (or a company
// that was turned off) is forgotten and asked for again.
async function loadTills(code: string): Promise<boolean> {
  errorMessage.value = ''
  try {
    activeTills.value = await listPublicTills(code)
  } catch (err) {
    if ((err as AxiosError)?.response?.status === 404) {
      errorMessage.value = apiErrorMessage(err)
      if (getCompanyCode() === code) forgetCompany()
    } else {
      errorMessage.value = t('pos.tillsLoadFailed')
    }
    return false
  }
  companyCode.value = code
  setCompanyCode(code)
  void branding.useCompany(code)
  return true
}

async function submitCode() {
  const code = normaliseCompanyCode(codeInput.value)
  if (!/^[A-Z0-9]{2,12}$/.test(code)) {
    errorMessage.value = t('pos.companyCodeInvalid')
    return
  }
  loading.value = true
  if (await loadTills(code)) pickDefaultTill()
  loading.value = false
}

// Another company's tills: the till picked here was this company's, so it's
// forgotten too.
function changeCompany() {
  companyCode.value = ''
  codeInput.value = ''
  activeTills.value = []
  deviceKey.value = ''
  errorMessage.value = ''
  auth.forgetTill()
  forgetCompany()
}

// No company until a good code is typed: none remembered, and the screen
// shows the app's own name and no logo instead of the last company's.
function forgetCompany() {
  setCompanyCode('')
  void branding.useCompany('')
}

// A session sees the tills of the selected branch only (the back office's
// branch switcher, or the Branch picker here); the PIN form lists every active
// till (the server checks the cashier's branch on sign-in).
const shownTills = computed(() => {
  if (!sessionMode.value) return activeTills.value
  return activeTills.value.filter((x) => x.branchId === auth.activeBranchId)
})
function tillLabel(x: PublicTill) {
  return x.branchName ? `${x.name} · ${x.branchName}` : x.name
}
const tillOptions = computed(() => shownTills.value.map((x) => ({ value: x.deviceKey, label: tillLabel(x) })))
const selectedTill = computed(() => shownTills.value.find((x) => x.deviceKey === deviceKey.value))
const tillName = computed(() => (selectedTill.value ? tillLabel(selectedTill.value) : ''))

// Another branch is picked here only by a back-office session, among the
// branches where its role may sell; a PIN sign-in stays at its till's branch.
const sellBranches = computed(() =>
  auth.branches.filter((b) => (b.permissions ?? auth.sessionPermissions).includes('pos.sell')),
)
const branchOptions = computed(() => sellBranches.value.map((b) => ({ value: b.id, label: b.name })))
const canPickBranch = computed(() => !auth.viaPinLogin && sellBranches.value.length > 1)
function setBranch(v: string | number | null) {
  const id = Number(v)
  if (!id || id === auth.activeBranchId) return
  auth.setActiveBranch(id)
  errorMessage.value = ''
  pickDefaultTill()
}

// The remembered till stays picked while it's listed. Otherwise a till is
// picked for the cashier only when it's the only one: with more, they choose,
// so a new shift never lands on a till by accident.
function pickDefaultTill() {
  if (shownTills.value.some((x) => x.deviceKey === deviceKey.value)) return
  deviceKey.value = shownTills.value.length === 1 ? shownTills.value[0].deviceKey : ''
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
  auth.selectTill(deviceKey.value, tillName.value, selectedTill.value.branchId)
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
  const till = selectedTill.value
  if (!till) {
    errorMessage.value = t('pos.pickTill')
    return
  }
  if (!username.value || pin.value.length !== 4) {
    errorMessage.value = t('pos.enterUserPin')
    return
  }
  submitting.value = true
  try {
    await auth.pinLogin(companyCode.value, till.deviceKey, tillName.value, till.branchId, username.value.trim(), pin.value)
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

      <!-- First time at this till (or after "Change company"): which company -->
      <form v-if="askCode" class="card space-y-4" @submit.prevent="submitCode">
        <div>
          <label for="company-code" class="block text-sm text-muted mb-1">{{ $t('pos.companyCode') }}</label>
          <input
            id="company-code"
            v-model="codeInput"
            type="text"
            class="input font-mono uppercase"
            maxlength="12"
            autocomplete="off"
            autocapitalize="characters"
            required
          />
          <p class="text-xs text-muted mt-1">{{ $t('pos.companyCodeHint') }}</p>
        </div>
        <p v-if="errorMessage" class="text-sm text-danger-strong text-center" role="alert">{{ errorMessage }}</p>
        <button type="submit" class="btn-primary w-full">{{ $t('pos.continue') }}</button>
      </form>

      <!-- Signed in already: pick a till and go -->
      <div v-else-if="sessionMode" class="card space-y-4">
        <p class="text-sm">{{ $t('pos.signedInAs', { name: auth.user?.full_name }) }}</p>
        <SearchableSelect
          v-if="canPickBranch"
          :model-value="auth.activeBranchId"
          :label="$t('common.branch')"
          :options="branchOptions"
          :clearable="false"
          data-branch-picker
          @update:model-value="setBranch"
        />
        <p v-else-if="auth.activeBranch" class="text-sm text-muted" data-branch-shown>
          {{ $t('common.branch') }}: <span class="text-ink">{{ auth.activeBranch.name }}</span>
        </p>
        <SearchableSelect
          :model-value="deviceKey || null"
          :label="$t('common.till')"
          :options="tillOptions"
          :clearable="false"
          :placeholder="$t('pos.pickTill')"
          @update:model-value="setTill"
        />
        <p v-if="!loading && tillOptions.length === 0" class="text-sm text-muted" data-no-tills>
          {{ auth.activeBranch ? $t('pos.noTillsAtBranch', { branch: auth.activeBranch.name }) : $t('pos.noTillsForYou') }}
        </p>
        <p v-if="errorMessage" class="text-sm text-danger-strong text-center" role="alert">{{ errorMessage }}</p>
        <button type="button" class="btn-primary w-full" :disabled="!selectedTill" @click="openWithSession">{{ $t('pos.openPos') }}</button>
        <button type="button" class="text-sm text-muted hover:text-ink block mx-auto" @click="switchToPin">{{ $t('pos.usePinInstead') }}</button>
      </div>

      <!-- Cashier PIN sign-in -->
      <form v-else-if="companyCode" class="card space-y-4" @submit.prevent="handleSubmit">
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
        <p class="text-xs text-muted text-center">
          {{ $t('pos.companyCodeShown', { code: companyCode }) }}
          <button type="button" class="text-primary hover:underline ml-1" @click="changeCompany">{{ $t('pos.changeCompany') }}</button>
        </p>
      </form>

      <div class="flex justify-center"><LanguageSwitch /></div>

      <RouterLink :to="{ name: auth.isAuthenticated ? 'dashboard' : 'login' }" class="text-sm text-muted hover:text-ink block text-center">
        {{ auth.isAuthenticated ? $t('pos.backOffice') : $t('pos.backOfficeSignIn') }}
      </RouterLink>
    </div>
  </div>
</template>
