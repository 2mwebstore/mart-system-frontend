<script setup lang="ts">
// An expense, new or being edited: category, branch, amount before tax, the
// tax on top (starting from Settings › Tax rates' rate for expenses), the date,
// and a rich-text note. Used by the Expenses page and Profit & Loss's "Add
// expense". The server works the tax out again and keeps it.
import { computed, reactive, watch } from 'vue'
import type { ExpenseInput } from '@/api/people'
import { EXPENSE_CATEGORIES, type Expense } from '@/types/domain'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { nameFor, percentFor, startingRate, taxCents, taxTitle } from '@/utils/tax'
import { label } from '@/i18n'
import SearchableSelect from '@/components/SearchableSelect.vue'
import RichTextEditor from '@/components/RichTextEditor.vue'
import TaxSelect from '@/components/TaxSelect.vue'
import MoneyInput from '@/components/MoneyInput.vue'
import { useMoney } from '@/composables/useMoney'

// Amounts are in the company's main currency (cents, or whole riel).
const { money, toMinor, toMajor, currency } = useMoney()

const props = withDefaults(defineProps<{ expense?: Expense | null; branchId: number; showBranch?: boolean; saving?: boolean }>(), {
  expense: null,
  showBranch: true,
  saving: false,
})
const emit = defineEmits<{ save: [ExpenseInput]; cancel: [] }>()

const auth = useAuthStore()
const settings = useSettingsStore()

const today = () => new Date().toLocaleDateString('en-CA')
const form = reactive({
  category: EXPENSE_CATEGORIES[0],
  branchId: props.branchId,
  amount: 0,
  taxRateId: null as number | null,
  date: today(),
  note: '',
})
watch(
  () => props.expense,
  (e) =>
    Object.assign(
      form,
      e
        ? { category: e.category, branchId: e.branchId, amount: toMajor(e.amountCents), taxRateId: e.taxRateId, date: e.expenseDate, note: e.note }
        : {
            category: EXPENSE_CATEGORIES[0],
            branchId: props.branchId,
            amount: 0,
            taxRateId: startingRate(settings.app.taxDefaults?.expense, settings.taxRates),
            date: today(),
            note: '',
          },
    ),
  { immediate: true },
)

const categoryOptions = computed(() => EXPENSE_CATEGORIES.map((c) => ({ value: c, label: label('expenseCat', c) })))
const branchOptions = computed(() => auth.branches.map((b) => ({ value: b.id, label: b.name })))

const amountCents = computed(() => toMinor(Number(form.amount)) || 0)
// The expense's own rate stays as it was kept, like the server's.
const kept = computed(() => props.expense)
const percent = computed(() => percentFor(form.taxRateId, settings.taxRates, kept.value))
const tax = computed(() => taxCents(amountCents.value, percent.value))
const taxName = computed(() => nameFor(form.taxRateId, settings.taxRates, kept.value))

function submit() {
  emit('save', {
    branchId: form.branchId,
    category: form.category,
    amountCents: amountCents.value,
    taxRateId: form.taxRateId,
    expenseDate: form.date,
    note: form.note,
  })
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <SearchableSelect v-model="form.category" :label="$t('common.category')" :options="categoryOptions" :searchable="false" :clearable="false" />
    <SearchableSelect v-if="showBranch" v-model="form.branchId" :label="$t('common.branch')" :options="branchOptions" :searchable="false" :clearable="false" />
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label for="expense-amount" class="block text-sm text-muted mb-1">{{ $t('tax.amountBeforeTax') }}</label>
        <MoneyInput id="expense-amount" v-model="form.amount" :currency="currency" required />
      </div>
      <div>
        <label for="expense-date" class="block text-sm text-muted mb-1">{{ $t('common.date') }}</label>
        <input id="expense-date" v-model="form.date" type="date" class="input" required />
      </div>
    </div>
    <TaxSelect v-model="form.taxRateId" :kept="kept" />
    <div class="rounded-control bg-surface-subtle px-3 py-2 text-sm space-y-1" data-expense-totals>
      <div v-if="form.taxRateId" class="flex justify-between text-muted">
        <span>{{ $t('tax.line', { name: taxTitle(taxName, percent) }) }}</span>
        <span class="font-mono">{{ money(tax) }}</span>
      </div>
      <div class="flex justify-between font-medium">
        <span>{{ $t('tax.totalWithTax') }}</span>
        <span class="font-mono">{{ money(amountCents + tax) }}</span>
      </div>
    </div>
    <RichTextEditor id="expense-note" v-model="form.note" :label="$t('common.note')" />
    <div class="flex justify-end gap-2 pt-2">
      <button type="button" class="btn-secondary" @click="emit('cancel')">{{ $t('common.cancel') }}</button>
      <button type="submit" class="btn-primary" :disabled="saving">{{ expense ? $t('common.save') : $t('common.add') }}</button>
    </div>
  </form>
</template>
