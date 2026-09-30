<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { Pencil, Plus } from 'lucide-vue-next'
import * as peopleApi from '@/api/people'
import { EXPENSE_CATEGORIES, type Expense } from '@/types/domain'
import { usePagedList } from '@/composables/usePagedList'
import Pagination from '@/components/Pagination.vue'
import { useAuthStore } from '@/stores/auth'
import { formatUSD } from '@/utils/format'
import Modal from '@/components/Modal.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import ConfirmDelete from '@/components/ConfirmDelete.vue'
import { useToast } from '@/composables/useToast'
import { label, t } from '@/i18n'

const toast = useToast()
const auth = useAuthStore()

const branchFilter = ref<number>(auth.activeBranchId ?? auth.branches[0]?.id ?? 1)
const categoryFilter = ref<'all' | string>('all')

const categoryOptions = computed(() => EXPENSE_CATEGORIES.map((c) => ({ value: c, label: label('expenseCat', c) })))
const categoryFilterOptions = computed(() => [{ value: 'all', label: t('expenses.allCategories') }, ...categoryOptions.value])
const branchOptions = computed(() => auth.branches.map((b) => ({ value: b.id, label: b.name })))

// One server page at a time; the Total shown is the server's sum over every
// matching expense, not just this page.
const list = reactive(
  usePagedList(
    ({ page, perPage }) =>
      peopleApi.pageExpenses(branchFilter.value, { page, perPage, category: categoryFilter.value === 'all' ? null : categoryFilter.value }),
    { deps: [branchFilter, categoryFilter] },
  ),
)
const total = computed(() => list.summary?.totalCents ?? 0)
const load = () => list.reload()

const today = () => new Date().toLocaleDateString('en-CA')
const showModal = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const form = reactive({ category: EXPENSE_CATEGORIES[0], amount: '' as string | number, date: today(), note: '', branchId: branchFilter.value })

function newExpense() {
  editingId.value = null
  Object.assign(form, { category: EXPENSE_CATEGORIES[0], amount: '', date: today(), note: '', branchId: branchFilter.value })
  showModal.value = true
}
function editExpense(e: Expense) {
  editingId.value = e.id
  Object.assign(form, { category: e.category, amount: e.amountCents / 100, date: e.expenseDate, note: e.note, branchId: e.branchId })
  showModal.value = true
}
async function submit() {
  saving.value = true
  const body = {
    branchId: form.branchId,
    category: form.category,
    amountCents: Math.round(Number(form.amount) * 100),
    expenseDate: form.date,
    note: form.note,
  }
  try {
    if (editingId.value === null) {
      await peopleApi.createExpense(body)
      toast.success(t('expenses.added'))
    } else {
      await peopleApi.updateExpense(editingId.value, body)
      toast.success(t('expenses.updated'))
    }
    showModal.value = false
    if (form.branchId !== branchFilter.value) branchFilter.value = form.branchId
    else await load()
  } catch {
    // toasted by the API client
  } finally {
    saving.value = false
  }
}
async function remove(id: number) {
  try {
    await peopleApi.deleteExpense(id)
    toast.success(t('expenses.deleted'))
    await load()
  } catch {
    // toasted by the API client
  }
}
</script>

<template>
  <div class="p-4 sm:p-8 space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <h1 class="font-heading text-2xl">{{ $t('expenses.title') }}</h1>
      <button type="button" class="btn-primary flex items-center gap-2" @click="newExpense">
        <Plus :stroke-width="1.8" class="w-4 h-4" /> {{ $t('expenses.add') }}
      </button>
    </div>

    <div class="card space-y-4">
      <div class="flex flex-wrap gap-3 items-end">
        <SearchableSelect v-model="branchFilter" :label="$t('common.branch')" class="w-44" :options="branchOptions" :searchable="false" :clearable="false" />
        <SearchableSelect v-model="categoryFilter" :label="$t('common.category')" class="w-48" :options="categoryFilterOptions" :searchable="false" :clearable="false" />
        <div class="ml-auto text-sm text-muted">{{ $t('common.total') }} <span class="font-mono text-ink">{{ formatUSD(total) }}</span></div>
      </div>

      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-muted border-b border-line">
            <th class="py-2 font-medium">{{ $t('col.date') }}</th>
            <th class="py-2 font-medium">{{ $t('col.category') }}</th>
            <th class="py-2 font-medium">{{ $t('col.note') }}</th>
            <th class="py-2 font-medium">{{ $t('col.addedBy') }}</th>
            <th class="py-2 pr-4 font-medium text-right">{{ $t('col.amount') }}</th>
            <th class="py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in list.rows" :key="e.id" class="border-b border-line last:border-0">
            <td class="py-2 font-mono text-xs">{{ e.expenseDate }}</td>
            <td class="py-2">{{ label('expenseCat', e.category) }}</td>
            <td class="py-2 text-muted">{{ e.note }}</td>
            <td class="py-2 text-muted">{{ e.user }}</td>
            <td class="py-2 pr-4 text-right font-mono">{{ formatUSD(e.amountCents) }}</td>
            <td class="py-2">
              <div class="flex items-center gap-1">
                <button type="button" class="p-1.5 text-muted hover:text-ink" :aria-label="$t('expenses.editAria')" @click="editExpense(e)">
                  <Pencil :stroke-width="1.8" class="w-4 h-4" />
                </button>
                <ConfirmDelete :item-label="$t('entity.expense')" :item-name="`${label('expenseCat', e.category)} ${formatUSD(e.amountCents)}`" @confirm="remove(e.id)" />
              </div>
            </td>
          </tr>
          <tr v-if="!list.loading && list.rows.length === 0">
            <td colspan="6" class="py-6 text-center text-muted">{{ $t('expenses.none') }}</td>
          </tr>
        </tbody>
      </table>
      <Pagination v-model:page="list.page" :total-pages="list.totalPages" :total="list.total" :per-page="list.perPage" :noun="$t('expenses.noun')" />
    </div>

    <Modal v-if="showModal" :title="editingId === null ? $t('expenses.add') : $t('expenses.edit')" @close="showModal = false">
      <form class="space-y-4" @submit.prevent="submit">
        <SearchableSelect v-model="form.category" :label="$t('common.category')" :options="categoryOptions" :searchable="false" :clearable="false" />
        <SearchableSelect v-model="form.branchId" :label="$t('common.branch')" :options="branchOptions" :searchable="false" :clearable="false" />
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm text-muted mb-1">{{ $t('expenses.amountUsd') }}</label>
            <input v-model="form.amount" type="number" min="0.01" step="0.01" class="input" required />
          </div>
          <div>
            <label class="block text-sm text-muted mb-1">{{ $t('common.date') }}</label>
            <input v-model="form.date" type="date" class="input" required />
          </div>
        </div>
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('common.note') }}</label>
          <input v-model="form.note" type="text" class="input" />
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="showModal = false">{{ $t('common.cancel') }}</button>
          <button type="submit" class="btn-primary" :disabled="saving">{{ editingId === null ? $t('common.add') : $t('common.save') }}</button>
        </div>
      </form>
    </Modal>
  </div>
</template>
