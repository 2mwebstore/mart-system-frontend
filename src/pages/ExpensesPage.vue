<script setup lang="ts">
// Expenses: amounts are before tax; a tax rate can be added on top (Settings ›
// Tax rates), and the note is rich text. The list shows the amount, the tax
// and what was paid, and the note on one line.
import { computed, reactive, ref } from 'vue'
import { Pencil, Plus } from 'lucide-vue-next'
import * as peopleApi from '@/api/people'
import type { ExpenseInput } from '@/api/people'
import { EXPENSE_CATEGORIES, type Expense } from '@/types/domain'
import { useDebounced, usePagedList } from '@/composables/usePagedList'
import Pagination from '@/components/Pagination.vue'
import { useAuthStore } from '@/stores/auth'
import { formatUSD } from '@/utils/format'
import { plainText } from '@/utils/richText'
import Modal from '@/components/Modal.vue'
import ExpenseForm from '@/components/expenses/ExpenseForm.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import SearchInput from '@/components/SearchInput.vue'
import DateRangePicker from '@/components/DateRangePicker.vue'
import ConfirmDelete from '@/components/ConfirmDelete.vue'
import { useToast } from '@/composables/useToast'
import { label, t } from '@/i18n'

const toast = useToast()
const auth = useAuthStore()
// Create / edit / delete: one permission each.
const canCreate = auth.hasPermission('expense.create')
const canEdit = auth.hasPermission('expense.update')
const canDelete = auth.hasPermission('expense.delete')

const branchFilter = ref<number>(auth.activeBranchId ?? auth.branches[0]?.id ?? 1)
const categoryFilter = ref<'all' | string>('all')
const search = ref('')
const debouncedSearch = useDebounced(search)
const range = ref<{ from: string; to: string } | null>(null)

const categoryOptions = computed(() => EXPENSE_CATEGORIES.map((c) => ({ value: c, label: label('expenseCat', c) })))
const categoryFilterOptions = computed(() => [{ value: 'all', label: t('expenses.allCategories') }, ...categoryOptions.value])
const branchOptions = computed(() => auth.branches.map((b) => ({ value: b.id, label: b.name })))

// One server page at a time; the Total shown is the server's sum over every
// matching expense, not just this page.
const list = reactive(
  usePagedList(
    ({ page, perPage }) =>
      peopleApi.pageExpenses(branchFilter.value, {
        page,
        perPage,
        q: debouncedSearch.value.trim(),
        category: categoryFilter.value === 'all' ? null : categoryFilter.value,
        dateFrom: range.value?.from,
        dateTo: range.value?.to,
      }),
    { deps: [branchFilter, categoryFilter, debouncedSearch, range] },
  ),
)
// What was paid (tax included), and the tax in it.
const total = computed(() => list.summary?.totalCents ?? 0)
const totalTax = computed(() => list.summary?.taxCents ?? 0)
const load = () => list.reload()

const showModal = ref(false)
const editing = ref<Expense | null>(null)
const saving = ref(false)

function newExpense() {
  editing.value = null
  showModal.value = true
}
function editExpense(e: Expense) {
  editing.value = e
  showModal.value = true
}
async function submit(body: ExpenseInput) {
  saving.value = true
  try {
    if (editing.value === null) {
      await peopleApi.createExpense(body)
      toast.success(t('expenses.added'))
    } else {
      await peopleApi.updateExpense(editing.value.id, body)
      toast.success(t('expenses.updated'))
    }
    showModal.value = false
    if (body.branchId !== branchFilter.value) branchFilter.value = body.branchId
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
      <button v-if="canCreate" type="button" class="btn-primary flex items-center gap-2" @click="newExpense">
        <Plus :stroke-width="1.8" class="w-4 h-4" /> {{ $t('expenses.add') }}
      </button>
    </div>

    <div class="card space-y-4">
      <div class="list-toolbar">
        <div class="list-filters">
          <SearchInput v-model="search" :label="$t('common.searchLabel')" :placeholder="$t('expenses.searchPlaceholder')" />
          <SearchableSelect v-model="branchFilter" :label="$t('common.branch')" class="w-full sm:w-44" :options="branchOptions" :searchable="false" :clearable="false" />
          <SearchableSelect v-model="categoryFilter" :label="$t('common.category')" class="w-full sm:w-48" :options="categoryFilterOptions" :searchable="false" :clearable="false" />
          <div class="w-full sm:w-auto">
            <span class="block text-sm text-muted mb-1">{{ $t('inventory.dateRange') }}</span>
            <DateRangePicker v-model="range" clearable @clear="range = null" />
          </div>
        </div>
        <div class="rounded-control bg-surface-subtle px-3 py-2 text-sm text-muted" data-expense-summary>
          {{ $t('common.total') }} <span class="font-mono font-semibold text-ink">{{ formatUSD(total) }}</span>
          <template v-if="totalTax > 0">
            · {{ $t('tax.label') }} <span class="font-mono text-ink">{{ formatUSD(totalTax) }}</span>
          </template>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted border-b border-line">
              <th class="py-2 font-medium">{{ $t('col.date') }}</th>
              <th class="py-2 font-medium">{{ $t('col.category') }}</th>
              <th class="py-2 font-medium">{{ $t('col.note') }}</th>
              <th class="py-2 font-medium">{{ $t('col.addedBy') }}</th>
              <th class="py-2 font-medium text-right">{{ $t('col.amount') }}</th>
              <th class="py-2 font-medium text-right">{{ $t('tax.label') }}</th>
              <th class="py-2 pr-4 font-medium text-right">{{ $t('col.total') }}</th>
              <th class="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in list.rows" :key="e.id" class="border-b border-line last:border-0">
              <td class="py-2 font-mono text-xs">{{ e.expenseDate }}</td>
              <td class="py-2">{{ label('expenseCat', e.category) }}</td>
              <td class="py-2 text-muted max-w-xs truncate" :title="plainText(e.note)">{{ plainText(e.note) }}</td>
              <td class="py-2 text-muted">{{ e.user }}</td>
              <td class="py-2 text-right font-mono">{{ formatUSD(e.amountCents) }}</td>
              <td class="py-2 text-right font-mono text-muted" :title="e.taxName">{{ e.taxCents ? formatUSD(e.taxCents) : '—' }}</td>
              <td class="py-2 pr-4 text-right font-mono">{{ formatUSD(e.totalCents) }}</td>
              <td class="py-2">
                <div class="flex items-center gap-1">
                  <button v-if="canEdit" type="button" class="p-1.5 text-muted hover:text-ink" :aria-label="$t('expenses.editAria')" @click="editExpense(e)">
                    <Pencil :stroke-width="1.8" class="w-4 h-4" />
                  </button>
                  <ConfirmDelete v-if="canDelete" :item-label="$t('entity.expense')" :item-name="`${label('expenseCat', e.category)} ${formatUSD(e.totalCents)}`" @confirm="remove(e.id)" />
                </div>
              </td>
            </tr>
            <tr v-if="!list.loading && list.rows.length === 0">
              <td colspan="8" class="py-6 text-center text-muted">{{ $t('expenses.none') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <Pagination v-model:page="list.page" :total-pages="list.totalPages" :total="list.total" :per-page="list.perPage" :noun="$t('expenses.noun')" />
    </div>

    <Modal v-if="showModal" wide :title="editing === null ? $t('expenses.add') : $t('expenses.edit')" @close="showModal = false">
      <ExpenseForm :expense="editing" :branch-id="branchFilter" :saving="saving" @save="submit" @cancel="showModal = false" />
    </Modal>
  </div>
</template>
