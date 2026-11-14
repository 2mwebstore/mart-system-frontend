<script setup lang="ts">
// The super admin's Edit company page (Platform > Companies > the pencil): the
// company's name and code, whether it's on, its limits, whether it works in
// shifts, its main currency, whether it uses tables, and how long it keeps its
// activity log. Saving goes back to the list.
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Trash2 } from 'lucide-vue-next'
import * as platformApi from '@/api/platform'
import { normaliseCompanyCode } from '@/api/companyCode'
import type { Company, Currency, ShiftMode } from '@/types/domain'
import ShiftModePicker from '@/components/platform/ShiftModePicker.vue'
import MainCurrencyPicker from '@/components/platform/MainCurrencyPicker.vue'
import TablesPicker from '@/components/platform/TablesPicker.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { useToast } from '@/composables/useToast'
import { codeInputPattern, codeOk, codeWrong, fromLimit, limitValid, toLimit, type LimitField } from '@/utils/companyForm'
import { t } from '@/i18n'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const company = ref<Company | null>(null)
const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const clearingLog = ref(false)
const form = reactive({
  name: '',
  code: '',
  active: true,
  maxBranches: '' as LimitField,
  maxUsers: '' as LimitField,
  retentionMonths: 3,
  shiftMode: 'REQUIRED' as ShiftMode,
  mainCurrency: 'USD' as Currency,
  usesTables: true,
})
const valid = computed(() => codeOk(form.code) && limitValid(form.maxBranches) && limitValid(form.maxUsers))
// A limit below what the company has switches nothing off: say so.
const branchesOverLimit = computed(() => {
  const max = toLimit(form.maxBranches)
  return company.value !== null && max !== null && limitValid(form.maxBranches) && company.value.activeBranchCount > max
})
const usersOverLimit = computed(() => {
  const max = toLimit(form.maxUsers)
  return company.value !== null && max !== null && limitValid(form.maxUsers) && company.value.activeUserCount > max
})
const activeOf = (active: number, max: number | null) =>
  max === null ? t('platform.activeCount', { active }) : t('platform.activeOf', { active, max })

onMounted(async () => {
  try {
    const c = await platformApi.getCompany(Number(route.params.id))
    company.value = c
    Object.assign(form, {
      name: c.name,
      code: c.code,
      active: c.active,
      maxBranches: fromLimit(c.maxBranches),
      maxUsers: fromLimit(c.maxUsers),
      retentionMonths: c.retentionMonths,
      shiftMode: c.shiftMode,
      mainCurrency: c.mainCurrency,
      usesTables: c.usesTables,
    })
  } catch {
    loadError.value = t('platform.companyLoadFailed')
  } finally {
    loading.value = false
  }
})

function back() {
  void router.push({ name: 'platform-companies' })
}

async function save() {
  // The browser checks the fields first and says what's wrong; this is a backstop.
  if (!company.value || !valid.value) return
  saving.value = true
  try {
    await platformApi.updateCompany(company.value.id, {
      ...form,
      code: normaliseCompanyCode(form.code),
      maxBranches: toLimit(form.maxBranches),
      maxUsers: toLimit(form.maxUsers),
    })
    toast.success(t('platform.companySaved'))
    back()
  } catch {
    // the API client already toasted the reason
  } finally {
    saving.value = false
  }
}

async function clearLog() {
  if (!company.value) return
  clearingLog.value = true
  try {
    const res = await platformApi.clearCompanyActivityLog(company.value.id)
    toast.success(t('settings.retentionCleared', { count: res.deleted }))
  } catch {
    // the API client already toasted the reason
  } finally {
    clearingLog.value = false
  }
}
</script>

<template>
  <div class="p-4 sm:p-8 space-y-6 max-w-3xl">
    <div class="space-y-2">
      <RouterLink :to="{ name: 'platform-companies' }" class="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink" data-back-to-companies>
        <ArrowLeft class="w-4 h-4" /> {{ $t('platform.backToCompanies') }}
      </RouterLink>
      <div class="flex flex-wrap items-center gap-2">
        <h1 class="font-heading text-2xl">{{ company ? $t('platform.editCompanyTitle', { name: company.name }) : $t('platform.editCompany') }}</h1>
        <span v-if="company" class="font-mono text-xs text-muted">{{ company.code }}</span>
        <StatusBadge v-if="company" :tone="company.active ? 'success' : 'neutral'" :label="company.active ? $t('common.active') : $t('common.disabled')" />
      </div>
    </div>

    <p v-if="loading" class="text-muted">{{ $t('common.loading') }}</p>
    <div v-else-if="loadError || !company" class="card space-y-3">
      <p class="text-danger-strong">{{ loadError }}</p>
      <button type="button" class="btn-secondary" @click="back">{{ $t('platform.backToCompanies') }}</button>
    </div>

    <form v-else class="space-y-6" data-company-form @submit.prevent="save">
      <section class="card space-y-4">
        <h2 class="font-heading text-lg">{{ $t('platform.companyDetails') }}</h2>
        <div>
          <label for="edit-name" class="block text-sm text-muted mb-1">{{ $t('platform.companyName') }}</label>
          <input id="edit-name" v-model="form.name" type="text" class="input" maxlength="120" required />
        </div>
        <div>
          <label for="edit-code" class="block text-sm text-muted mb-1">{{ $t('platform.code') }}</label>
          <input
            id="edit-code"
            v-model="form.code"
            type="text"
            class="input font-mono uppercase w-40"
            maxlength="12"
            autocomplete="off"
            required
            :pattern="codeInputPattern"
            :title="$t('platform.codeInvalid')"
            :aria-invalid="codeWrong(form.code)"
            aria-describedby="edit-code-help"
          />
          <p id="edit-code-help" class="text-xs mt-1" :class="codeWrong(form.code) ? 'text-danger-strong' : 'text-muted'" data-code-help>
            {{ codeWrong(form.code) ? $t('platform.codeInvalid') : $t('platform.codeChangeHint') }}
          </p>
        </div>
        <div class="flex items-center justify-between gap-3 text-sm">
          <span id="edit-active-label">{{ $t('common.active') }}</span>
          <button
            type="button"
            role="switch"
            :aria-checked="form.active"
            aria-labelledby="edit-active-label"
            class="w-9 h-5 rounded-full transition-colors relative shrink-0"
            :class="form.active ? 'bg-primary' : 'bg-line'"
            data-company-active
            @click="form.active = !form.active"
          >
            <span class="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" :class="form.active ? 'left-4' : 'left-0.5'" />
          </button>
        </div>
        <p v-if="company.active && !form.active" class="text-xs text-danger-strong">{{ $t('platform.disableWarning') }}</p>
      </section>

      <fieldset class="card space-y-2">
        <legend class="sr-only">{{ $t('platform.limits') }}</legend>
        <h2 class="font-heading text-lg" aria-hidden="true">{{ $t('platform.limits') }}</h2>
        <p class="text-xs text-muted">{{ $t('platform.limitsHint') }}</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label for="edit-max-branches" class="block text-sm text-muted mb-1">{{ $t('platform.maxBranches') }}</label>
            <input id="edit-max-branches" v-model.number="form.maxBranches" type="number" min="1" step="1" class="input" :placeholder="$t('platform.noLimit')" />
            <p class="text-xs text-muted mt-1">{{ activeOf(company.activeBranchCount, company.maxBranches) }}</p>
          </div>
          <div>
            <label for="edit-max-users" class="block text-sm text-muted mb-1">{{ $t('platform.maxUsers') }}</label>
            <input id="edit-max-users" v-model.number="form.maxUsers" type="number" min="1" step="1" class="input" :placeholder="$t('platform.noLimit')" />
            <p class="text-xs text-muted mt-1">{{ activeOf(company.activeUserCount, company.maxUsers) }}</p>
          </div>
        </div>
        <p v-if="branchesOverLimit" class="text-xs text-warning-text">{{ $t('platform.limitBelowCount', { active: company.activeBranchCount }) }}</p>
        <p v-if="usersOverLimit" class="text-xs text-warning-text">{{ $t('platform.limitBelowCount', { active: company.activeUserCount }) }}</p>
      </fieldset>

      <section class="card space-y-4">
        <h2 class="font-heading text-lg">{{ $t('platform.companyFeatures') }}</h2>
        <ShiftModePicker v-model="form.shiftMode" name="edit-shift-mode" />
        <MainCurrencyPicker v-model="form.mainCurrency" name="edit-main-currency" :locked="company.mainCurrencyLocked" class="border-t border-line pt-4" />
        <TablesPicker v-model="form.usesTables" name="edit-tables" class="border-t border-line pt-4" />
      </section>

      <section class="card space-y-2">
        <h2 class="font-heading text-lg">{{ $t('platform.activityLog') }}</h2>
        <label for="edit-retention" class="block text-sm text-muted">{{ $t('platform.retention') }}</label>
        <select id="edit-retention" v-model.number="form.retentionMonths" class="input w-32">
          <option v-for="n in [1, 2, 3]" :key="n" :value="n">{{ $t('settings.retentionMonthsOption', { n }, n) }}</option>
        </select>
        <p class="text-xs text-muted">{{ $t('platform.retentionHint') }}</p>
        <p class="text-xs text-muted">{{ $t('settings.retentionClearNowHint') }}</p>
        <button type="button" class="btn-secondary flex items-center gap-2" :disabled="clearingLog" data-clear-log @click="clearLog">
          <Trash2 :stroke-width="1.8" class="w-4 h-4" /> {{ $t('settings.retentionClearNow') }}
        </button>
      </section>

      <div class="flex justify-end gap-2">
        <button type="button" class="btn-secondary" @click="back">{{ $t('common.cancel') }}</button>
        <button type="submit" class="btn-primary" :disabled="saving">{{ $t('common.save') }}</button>
      </div>
    </form>
  </div>
</template>
