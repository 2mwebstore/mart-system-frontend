<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { KeyRound, Pencil, Plus, Power, Trash2 } from 'lucide-vue-next'
import * as platformApi from '@/api/platform'
import { normaliseCompanyCode } from '@/api/companyCode'
import type { Company, CompanyBranch, CompanyUser } from '@/types/domain'
import Modal from '@/components/Modal.vue'
import PasswordInput from '@/components/PasswordInput.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import SearchInput from '@/components/SearchInput.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import Pagination from '@/components/Pagination.vue'
import { useLocalList } from '@/composables/useLocalList'
import { useToast } from '@/composables/useToast'
import { t } from '@/i18n'

// The super admin's list of companies. They make each company with its first
// Owner, who signs in and sets up its branches, tills, staff and catalog; they
// set each company's limits and how long it keeps its activity log, switch its
// branches and accounts on and off, and look after the Owner accounts when
// nobody in a company can.
const toast = useToast()
const companies = ref<Company[]>([])
const loading = ref(true)

async function load() {
  try {
    companies.value = await platformApi.listCompanies()
  } catch {
    // the API client already toasted the reason
  } finally {
    loading.value = false
  }
}
onMounted(load)

// Searched by company name, code or an Owner's name or username; filtered by
// active/disabled; paged here (the list comes whole).
const statusFilter = ref<'all' | 'active' | 'disabled'>('all')
const statusFilterOptions = computed(() => [
  { value: 'all', label: t('common.allStatuses') },
  { value: 'active', label: t('common.active') },
  { value: 'disabled', label: t('common.disabled') },
])
const companyList = useLocalList(() => companies.value, {
  text: (c) => [c.name, c.code, ...c.owners.flatMap((o) => [o.fullName, o.username])].join(' '),
  filter: (c) => statusFilter.value === 'all' || c.active === (statusFilter.value === 'active'),
  deps: [statusFilter],
})

function replace(updated: Company) {
  const i = companies.value.findIndex((c) => c.id === updated.id)
  if (i === -1) companies.value.push(updated)
  else companies.value[i] = updated
}

const codePattern = /^[A-Z0-9]{2,12}$/
const codeOk = (raw: string) => codePattern.test(normaliseCompanyCode(raw))
// The same rule for the browser, so a wrong code is pointed out on Create or
// Save instead of the button just not working. Spaces round it are trimmed.
const codeInputPattern = '\\s*[A-Za-z0-9]{2,12}\\s*'
// Said under the field as soon as what's typed can't be a code.
const codeWrong = (raw: string) => raw.trim() !== '' && !codeOk(raw)

// A limit field: blank is no limit.
type LimitField = number | ''
const toLimit = (v: LimitField): number | null => (v === '' || v === null ? null : Number(v))
const fromLimit = (v: number | null): LimitField => (v === null ? '' : v)
const limitValid = (v: LimitField) => v === '' || v === null || (Number.isInteger(Number(v)) && Number(v) >= 1)
// "2 / 5" against a limit, "2" without one.
const countText = (active: number, max: number | null) => (max === null ? String(active) : `${active} / ${max}`)

// --- New company ---------------------------------------------------------------

const showCreate = ref(false)
const creating = ref(false)
const emptyCreate = () => ({
  name: '',
  code: '',
  ownerFullName: '',
  ownerUsername: '',
  ownerPassword: '',
  maxBranches: '' as LimitField,
  maxUsers: '' as LimitField,
})
const createForm = reactive(emptyCreate())
const createValid = computed(() => codeOk(createForm.code) && limitValid(createForm.maxBranches) && limitValid(createForm.maxUsers))

function openCreate() {
  Object.assign(createForm, emptyCreate())
  showCreate.value = true
}
async function submitCreate() {
  // The browser checks the fields first and says what's wrong; this is a backstop.
  if (!createValid.value) return
  creating.value = true
  try {
    const created = await platformApi.createCompany({
      ...createForm,
      code: normaliseCompanyCode(createForm.code),
      maxBranches: toLimit(createForm.maxBranches),
      maxUsers: toLimit(createForm.maxUsers),
    })
    replace(created)
    showCreate.value = false
    toast.success(t('platform.companyCreated', { name: created.name }))
  } catch {
    // the API client already toasted the reason
  } finally {
    creating.value = false
  }
}

// --- Edit company --------------------------------------------------------------

const editing = ref<Company | null>(null)
const saving = ref(false)
const clearingLog = ref(false)
const editForm = reactive({ name: '', code: '', active: true, maxBranches: '' as LimitField, maxUsers: '' as LimitField, retentionMonths: 3 })
const editValid = computed(() => codeOk(editForm.code) && limitValid(editForm.maxBranches) && limitValid(editForm.maxUsers))
// A limit below what the company has switches nothing off: say so.
const branchesOverLimit = computed(() => {
  const max = toLimit(editForm.maxBranches)
  return editing.value !== null && max !== null && limitValid(editForm.maxBranches) && editing.value.activeBranchCount > max
})
const usersOverLimit = computed(() => {
  const max = toLimit(editForm.maxUsers)
  return editing.value !== null && max !== null && limitValid(editForm.maxUsers) && editing.value.activeUserCount > max
})

function openEdit(c: Company) {
  editing.value = c
  Object.assign(editForm, {
    name: c.name,
    code: c.code,
    active: c.active,
    maxBranches: fromLimit(c.maxBranches),
    maxUsers: fromLimit(c.maxUsers),
    retentionMonths: c.retentionMonths,
  })
}
async function submitEdit() {
  if (!editing.value || !editValid.value) return
  saving.value = true
  try {
    replace(
      await platformApi.updateCompany(editing.value.id, {
        ...editForm,
        code: normaliseCompanyCode(editForm.code),
        maxBranches: toLimit(editForm.maxBranches),
        maxUsers: toLimit(editForm.maxUsers),
      }),
    )
    editing.value = null
    toast.success(t('platform.companySaved'))
  } catch {
    // the API client already toasted the reason
  } finally {
    saving.value = false
  }
}
async function clearLog() {
  if (!editing.value) return
  clearingLog.value = true
  try {
    const res = await platformApi.clearCompanyActivityLog(editing.value.id)
    toast.success(t('settings.retentionCleared', { count: res.deleted }))
  } catch {
    // the API client already toasted the reason
  } finally {
    clearingLog.value = false
  }
}

// --- Branches and staff, on and off -------------------------------------------

const partsOf = ref<Company | null>(null)
const branches = ref<CompanyBranch[]>([])
const users = ref<CompanyUser[]>([])
const loadingParts = ref(false)
const switching = ref('')

async function openParts(c: Company) {
  partsOf.value = c
  branches.value = []
  users.value = []
  loadingParts.value = true
  try {
    ;[branches.value, users.value] = await Promise.all([platformApi.listCompanyBranches(c.id), platformApi.listCompanyUsers(c.id)])
  } catch {
    // the API client already toasted the reason
  } finally {
    loadingParts.value = false
  }
}
// After a switch the counts against the limits change: show the new ones.
async function refreshCompany(id: number) {
  const fresh = (await platformApi.listCompanies()).find((c) => c.id === id)
  if (!fresh) return
  replace(fresh)
  if (partsOf.value?.id === id) partsOf.value = fresh
}
async function switchBranch(b: CompanyBranch) {
  if (!partsOf.value) return
  switching.value = `branch-${b.id}`
  try {
    const updated = await platformApi.setCompanyBranchActive(partsOf.value.id, b.id, !b.active)
    branches.value = branches.value.map((x) => (x.id === updated.id ? updated : x))
    toast.success(t(updated.active ? 'platform.switchedOn' : 'platform.switchedOff', { name: updated.name }))
    await refreshCompany(partsOf.value.id)
  } catch {
    // the API client already toasted the reason
  } finally {
    switching.value = ''
  }
}
async function switchUser(u: CompanyUser) {
  if (!partsOf.value) return
  switching.value = `user-${u.id}`
  try {
    const updated = await platformApi.setCompanyUserActive(partsOf.value.id, u.id, !u.active)
    users.value = users.value.map((x) => (x.id === updated.id ? updated : x))
    toast.success(t(updated.active ? 'platform.switchedOn' : 'platform.switchedOff', { name: updated.fullName }))
    await refreshCompany(partsOf.value.id)
  } catch {
    // the API client already toasted the reason
  } finally {
    switching.value = ''
  }
}
const activeOf = (active: number, max: number | null) =>
  max === null ? t('platform.activeCount', { active }) : t('platform.activeOf', { active, max })

// --- Owner accounts ------------------------------------------------------------

const ownerFor = ref<Company | null>(null)
const ownerMode = ref<'reset' | 'add'>('reset')
const savingOwner = ref(false)
const ownerForm = reactive({ userId: 0, fullName: '', username: '', password: '' })

function openOwner(c: Company) {
  ownerFor.value = c
  ownerMode.value = c.owners.length > 0 ? 'reset' : 'add'
  Object.assign(ownerForm, { userId: c.owners[0]?.id ?? 0, fullName: '', username: '', password: '' })
}
async function submitOwner() {
  if (!ownerFor.value) return
  savingOwner.value = true
  try {
    const body =
      ownerMode.value === 'reset'
        ? { userId: ownerForm.userId, password: ownerForm.password }
        : { fullName: ownerForm.fullName, username: ownerForm.username, password: ownerForm.password }
    replace(await platformApi.setCompanyOwner(ownerFor.value.id, body))
    toast.success(ownerMode.value === 'reset' ? t('platform.ownerReset') : t('platform.ownerAdded'))
    ownerFor.value = null
  } catch {
    // the API client already toasted the reason
  } finally {
    savingOwner.value = false
  }
}
</script>

<template>
  <div class="p-4 sm:p-8 space-y-6">
    <div class="flex items-center justify-between gap-4 flex-wrap">
      <div>
        <h1 class="font-heading text-2xl">{{ $t('platform.companiesTitle') }}</h1>
        <p class="text-sm text-muted mt-1 max-w-2xl">{{ $t('platform.companiesIntro') }}</p>
      </div>
      <button type="button" class="btn-primary flex items-center gap-2" @click="openCreate">
        <Plus :stroke-width="1.8" class="w-4 h-4" /> {{ $t('platform.newCompany') }}
      </button>
    </div>

    <div class="card space-y-4">
      <div class="list-filters">
        <SearchInput v-model="companyList.search" :placeholder="$t('platform.searchCompaniesPlaceholder')" class="sm:w-72" />
        <SearchableSelect v-model="statusFilter" class="w-full sm:w-44" :options="statusFilterOptions" :searchable="false" :clearable="false" />
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted border-b border-line">
              <th class="py-2 font-medium">{{ $t('platform.company') }}</th>
              <th class="py-2 font-medium">{{ $t('platform.code') }}</th>
              <th class="py-2 font-medium">{{ $t('col.status') }}</th>
              <th class="py-2 font-medium text-right pl-4">{{ $t('platform.branches') }}</th>
              <th class="py-2 font-medium text-right pl-4">{{ $t('platform.staff') }}</th>
              <th class="py-2 font-medium text-right pl-4">{{ $t('platform.logKept') }}</th>
              <th class="py-2 font-medium pl-4">{{ $t('platform.owners') }}</th>
              <th class="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in companyList.rows" :key="c.id" class="border-b border-line last:border-0 align-top">
              <td class="py-2.5 font-medium">{{ c.name }}</td>
              <td class="py-2.5 font-mono">{{ c.code }}</td>
              <td class="py-2.5">
                <StatusBadge :tone="c.active ? 'success' : 'neutral'" :label="c.active ? $t('common.active') : $t('common.disabled')" />
              </td>
              <td class="py-2.5 text-right pl-4 whitespace-nowrap">
                {{ countText(c.activeBranchCount, c.maxBranches) }}
                <p v-if="c.branchCount > c.activeBranchCount" class="text-xs text-muted">{{ $t('platform.offCount', { n: c.branchCount - c.activeBranchCount }) }}</p>
              </td>
              <td class="py-2.5 text-right pl-4 whitespace-nowrap">
                {{ countText(c.activeUserCount, c.maxUsers) }}
                <p v-if="c.userCount > c.activeUserCount" class="text-xs text-muted">{{ $t('platform.offCount', { n: c.userCount - c.activeUserCount }) }}</p>
              </td>
              <td class="py-2.5 text-right pl-4 whitespace-nowrap">{{ $t('settings.retentionMonthsOption', { n: c.retentionMonths }, c.retentionMonths) }}</td>
              <td class="py-2.5 pl-4">
                <p v-for="o in c.owners" :key="o.id" :class="o.active ? '' : 'text-muted line-through'">
                  {{ o.fullName }} <span class="text-xs text-muted font-mono">{{ o.username }}</span>
                </p>
                <p v-if="c.owners.length === 0" class="text-muted">{{ $t('platform.noOwner') }}</p>
              </td>
              <td class="py-2.5">
                <div class="flex items-center justify-end gap-1">
                  <button type="button" class="p-1.5 text-muted hover:text-ink" :title="$t('platform.partsButton')" :aria-label="$t('platform.partsButton')" @click="openParts(c)">
                    <Power :stroke-width="1.8" class="w-4 h-4" />
                  </button>
                  <button type="button" class="p-1.5 text-muted hover:text-ink" :title="$t('platform.ownerAccounts')" :aria-label="$t('platform.ownerAccounts')" @click="openOwner(c)">
                    <KeyRound :stroke-width="1.8" class="w-4 h-4" />
                  </button>
                  <button type="button" class="p-1.5 text-muted hover:text-ink" :title="$t('common.edit')" :aria-label="$t('common.edit')" @click="openEdit(c)">
                    <Pencil :stroke-width="1.8" class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="!loading && companyList.total === 0">
              <td colspan="8" class="py-8 text-center text-muted">{{ companies.length === 0 ? $t('platform.noCompanies') : $t('common.noMatches') }}</td>
            </tr>
            <tr v-if="loading">
              <td colspan="8" class="py-8 text-center text-muted">{{ $t('common.loading') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <Pagination v-model:page="companyList.page" :total-pages="companyList.totalPages" :total="companyList.total" :per-page="companyList.perPage" :noun="$t('platform.companiesNoun')" />
    </div>

    <Modal v-if="showCreate" :title="$t('platform.newCompany')" @close="showCreate = false">
      <form class="space-y-4" @submit.prevent="submitCreate">
        <div>
          <label for="company-name" class="block text-sm text-muted mb-1">{{ $t('platform.companyName') }}</label>
          <input id="company-name" v-model="createForm.name" type="text" class="input" maxlength="120" required />
        </div>
        <div>
          <label for="company-code" class="block text-sm text-muted mb-1">{{ $t('platform.code') }}</label>
          <input
            id="company-code"
            v-model="createForm.code"
            type="text"
            class="input font-mono uppercase w-40"
            maxlength="12"
            autocomplete="off"
            required
            :pattern="codeInputPattern"
            :title="$t('platform.codeInvalid')"
            :aria-invalid="codeWrong(createForm.code)"
            aria-describedby="company-code-help"
          />
          <p id="company-code-help" class="text-xs mt-1" :class="codeWrong(createForm.code) ? 'text-danger-strong' : 'text-muted'" data-code-help>
            {{ codeWrong(createForm.code) ? $t('platform.codeInvalid') : $t('platform.codeHint') }}
          </p>
        </div>
        <fieldset class="space-y-2">
          <legend class="sr-only">{{ $t('platform.limits') }}</legend>
          <p class="text-sm font-medium" aria-hidden="true">{{ $t('platform.limits') }}</p>
          <p class="text-xs text-muted">{{ $t('platform.limitsHint') }}</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label for="create-max-branches" class="block text-sm text-muted mb-1">{{ $t('platform.maxBranches') }}</label>
              <input id="create-max-branches" v-model.number="createForm.maxBranches" type="number" min="1" step="1" class="input" :placeholder="$t('platform.noLimit')" />
            </div>
            <div>
              <label for="create-max-users" class="block text-sm text-muted mb-1">{{ $t('platform.maxUsers') }}</label>
              <input id="create-max-users" v-model.number="createForm.maxUsers" type="number" min="1" step="1" class="input" :placeholder="$t('platform.noLimit')" />
            </div>
          </div>
        </fieldset>
        <div class="border-t border-line pt-4 space-y-4">
          <div>
            <h3 class="text-sm font-medium">{{ $t('platform.firstOwner') }}</h3>
            <p class="text-xs text-muted mt-0.5">{{ $t('platform.firstOwnerHint') }}</p>
          </div>
          <div>
            <label for="owner-name" class="block text-sm text-muted mb-1">{{ $t('platform.fullName') }}</label>
            <input id="owner-name" v-model="createForm.ownerFullName" type="text" class="input" maxlength="120" required />
          </div>
          <div>
            <label for="owner-username" class="block text-sm text-muted mb-1">{{ $t('auth.username') }}</label>
            <input id="owner-username" v-model="createForm.ownerUsername" type="text" class="input" maxlength="60" autocomplete="off" required />
          </div>
          <div>
            <label for="owner-password" class="block text-sm text-muted mb-1">{{ $t('auth.password') }}</label>
            <PasswordInput id="owner-password" v-model="createForm.ownerPassword" minlength="6" maxlength="72" autocomplete="new-password" required />
          </div>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="showCreate = false">{{ $t('common.cancel') }}</button>
          <button type="submit" class="btn-primary" :disabled="creating">{{ $t('platform.createCompany') }}</button>
        </div>
      </form>
    </Modal>

    <Modal v-if="editing" :title="$t('platform.editCompany')" @close="editing = null">
      <form class="space-y-4" @submit.prevent="submitEdit">
        <div>
          <label for="edit-name" class="block text-sm text-muted mb-1">{{ $t('platform.companyName') }}</label>
          <input id="edit-name" v-model="editForm.name" type="text" class="input" maxlength="120" required />
        </div>
        <div>
          <label for="edit-code" class="block text-sm text-muted mb-1">{{ $t('platform.code') }}</label>
          <input
            id="edit-code"
            v-model="editForm.code"
            type="text"
            class="input font-mono uppercase w-40"
            maxlength="12"
            autocomplete="off"
            required
            :pattern="codeInputPattern"
            :title="$t('platform.codeInvalid')"
            :aria-invalid="codeWrong(editForm.code)"
            aria-describedby="edit-code-help"
          />
          <p id="edit-code-help" class="text-xs mt-1" :class="codeWrong(editForm.code) ? 'text-danger-strong' : 'text-muted'" data-code-help>
            {{ codeWrong(editForm.code) ? $t('platform.codeInvalid') : $t('platform.codeChangeHint') }}
          </p>
        </div>
        <label class="flex items-center justify-between text-sm">
          <span>{{ $t('common.active') }}</span>
          <button
            type="button"
            role="switch"
            :aria-checked="editForm.active"
            class="w-9 h-5 rounded-full transition-colors relative"
            :class="editForm.active ? 'bg-primary' : 'bg-line'"
            @click="editForm.active = !editForm.active"
          >
            <span class="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" :class="editForm.active ? 'left-4' : 'left-0.5'" />
          </button>
        </label>
        <p v-if="editing.active && !editForm.active" class="text-xs text-danger-strong">{{ $t('platform.disableWarning') }}</p>

        <fieldset class="border-t border-line pt-4 space-y-2">
          <legend class="sr-only">{{ $t('platform.limits') }}</legend>
          <p class="text-sm font-medium" aria-hidden="true">{{ $t('platform.limits') }}</p>
          <p class="text-xs text-muted">{{ $t('platform.limitsHint') }}</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label for="edit-max-branches" class="block text-sm text-muted mb-1">{{ $t('platform.maxBranches') }}</label>
              <input id="edit-max-branches" v-model.number="editForm.maxBranches" type="number" min="1" step="1" class="input" :placeholder="$t('platform.noLimit')" />
              <p class="text-xs text-muted mt-1">{{ activeOf(editing.activeBranchCount, editing.maxBranches) }}</p>
            </div>
            <div>
              <label for="edit-max-users" class="block text-sm text-muted mb-1">{{ $t('platform.maxUsers') }}</label>
              <input id="edit-max-users" v-model.number="editForm.maxUsers" type="number" min="1" step="1" class="input" :placeholder="$t('platform.noLimit')" />
              <p class="text-xs text-muted mt-1">{{ activeOf(editing.activeUserCount, editing.maxUsers) }}</p>
            </div>
          </div>
          <p v-if="branchesOverLimit" class="text-xs text-warning-text">{{ $t('platform.limitBelowCount', { active: editing.activeBranchCount }) }}</p>
          <p v-if="usersOverLimit" class="text-xs text-warning-text">{{ $t('platform.limitBelowCount', { active: editing.activeUserCount }) }}</p>
        </fieldset>

        <div class="border-t border-line pt-4 space-y-2">
          <label for="edit-retention" class="block text-sm font-medium">{{ $t('platform.retention') }}</label>
          <select id="edit-retention" v-model.number="editForm.retentionMonths" class="input w-32">
            <option v-for="n in [1, 2, 3]" :key="n" :value="n">{{ $t('settings.retentionMonthsOption', { n }, n) }}</option>
          </select>
          <p class="text-xs text-muted">{{ $t('platform.retentionHint') }}</p>
          <p class="text-xs text-muted">{{ $t('settings.retentionClearNowHint') }}</p>
          <button type="button" class="btn-secondary flex items-center gap-2" :disabled="clearingLog" @click="clearLog">
            <Trash2 :stroke-width="1.8" class="w-4 h-4" /> {{ $t('settings.retentionClearNow') }}
          </button>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="editing = null">{{ $t('common.cancel') }}</button>
          <button type="submit" class="btn-primary" :disabled="saving">{{ $t('common.save') }}</button>
        </div>
      </form>
    </Modal>

    <Modal v-if="partsOf" wide :title="$t('platform.partsTitle', { name: partsOf.name })" @close="partsOf = null">
      <div class="space-y-5">
        <p class="text-xs text-muted">{{ $t('platform.partsIntro') }}</p>
        <p v-if="loadingParts" class="text-sm text-muted">{{ $t('common.loading') }}</p>
        <template v-else>
          <section class="space-y-2">
            <div class="flex items-baseline justify-between gap-2">
              <h3 class="text-sm font-medium">{{ $t('platform.branches') }}</h3>
              <span class="text-xs text-muted">{{ activeOf(partsOf.activeBranchCount, partsOf.maxBranches) }}</span>
            </div>
            <p v-if="branches.length === 0" class="text-sm text-muted">{{ $t('platform.noBranches') }}</p>
            <ul class="divide-y divide-line">
              <li v-for="b in branches" :key="b.id" class="flex items-center justify-between gap-3 py-2 text-sm">
                <span :class="b.active ? '' : 'text-muted'">{{ b.name }} <span class="text-xs text-muted font-mono">{{ b.code }}</span></span>
                <button
                  type="button"
                  role="switch"
                  :aria-checked="b.active"
                  :aria-label="b.name"
                  :disabled="switching !== ''"
                  class="w-9 h-5 rounded-full transition-colors relative shrink-0 disabled:opacity-60"
                  :class="b.active ? 'bg-primary' : 'bg-line'"
                  @click="switchBranch(b)"
                >
                  <span class="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" :class="b.active ? 'left-4' : 'left-0.5'" />
                </button>
              </li>
            </ul>
          </section>
          <section class="space-y-2">
            <div class="flex items-baseline justify-between gap-2">
              <h3 class="text-sm font-medium">{{ $t('platform.usersHeading') }}</h3>
              <span class="text-xs text-muted">{{ activeOf(partsOf.activeUserCount, partsOf.maxUsers) }}</span>
            </div>
            <ul class="divide-y divide-line">
              <li v-for="u in users" :key="u.id" class="flex items-center justify-between gap-3 py-2 text-sm">
                <span :class="u.active ? '' : 'text-muted'">
                  {{ u.fullName }} <span class="text-xs text-muted font-mono">{{ u.username }}</span>
                  <span class="block text-xs text-muted">{{ u.roleName }}</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  :aria-checked="u.active"
                  :aria-label="u.fullName"
                  :disabled="switching !== ''"
                  class="w-9 h-5 rounded-full transition-colors relative shrink-0 disabled:opacity-60"
                  :class="u.active ? 'bg-primary' : 'bg-line'"
                  @click="switchUser(u)"
                >
                  <span class="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" :class="u.active ? 'left-4' : 'left-0.5'" />
                </button>
              </li>
            </ul>
          </section>
        </template>
        <div class="flex justify-end pt-2">
          <button type="button" class="btn-secondary" @click="partsOf = null">{{ $t('common.close') }}</button>
        </div>
      </div>
    </Modal>

    <Modal v-if="ownerFor" :title="$t('platform.ownerAccountsOf', { name: ownerFor.name })" @close="ownerFor = null">
      <form class="space-y-4" @submit.prevent="submitOwner">
        <div class="flex gap-4 text-sm">
          <label v-if="ownerFor.owners.length > 0" class="flex items-center gap-2 cursor-pointer">
            <input v-model="ownerMode" type="radio" value="reset" /> {{ $t('platform.resetPassword') }}
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input v-model="ownerMode" type="radio" value="add" /> {{ $t('platform.addOwner') }}
          </label>
        </div>

        <template v-if="ownerMode === 'reset'">
          <div>
            <label for="owner-pick" class="block text-sm text-muted mb-1">{{ $t('platform.owner') }}</label>
            <select id="owner-pick" v-model.number="ownerForm.userId" class="input">
              <option v-for="o in ownerFor.owners" :key="o.id" :value="o.id">{{ o.fullName }} ({{ o.username }})</option>
            </select>
          </div>
          <p class="text-xs text-muted">{{ $t('platform.resetHint') }}</p>
        </template>
        <template v-else>
          <div>
            <label for="new-owner-name" class="block text-sm text-muted mb-1">{{ $t('platform.fullName') }}</label>
            <input id="new-owner-name" v-model="ownerForm.fullName" type="text" class="input" maxlength="120" required />
          </div>
          <div>
            <label for="new-owner-username" class="block text-sm text-muted mb-1">{{ $t('auth.username') }}</label>
            <input id="new-owner-username" v-model="ownerForm.username" type="text" class="input" maxlength="60" autocomplete="off" required />
          </div>
        </template>

        <div>
          <label for="owner-new-password" class="block text-sm text-muted mb-1">{{ $t('platform.newPassword') }}</label>
          <PasswordInput id="owner-new-password" v-model="ownerForm.password" minlength="6" maxlength="72" autocomplete="new-password" required />
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="ownerFor = null">{{ $t('common.cancel') }}</button>
          <button type="submit" class="btn-primary" :disabled="savingOwner">{{ $t('common.save') }}</button>
        </div>
      </form>
    </Modal>
  </div>
</template>
