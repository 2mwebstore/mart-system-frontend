<script setup lang="ts">
// Settings › Tax rates: the company's rates (VAT 10%…), added on top of a POS
// sale, an invoice, a purchase order or an expense, and the rate each of those
// starts with. Staff can change the rate on each document, or pick "No tax".
// A document keeps the rate it used, so changing or deleting one here never
// changes a document already made. Listing needs no permission (the till and
// the forms pick from it); changing needs tax_rate.create / update / delete.
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Pencil, Plus } from 'lucide-vue-next'
import * as settingsApi from '@/api/settings'
import type { TaxDefaults, TaxRate } from '@/types/domain'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { useToast } from '@/composables/useToast'
import { formatPercent } from '@/utils/tax'
import { t } from '@/i18n'
import Modal from '@/components/Modal.vue'
import ConfirmDelete from '@/components/ConfirmDelete.vue'
import TaxSelect from '@/components/TaxSelect.vue'

const auth = useAuthStore()
const settings = useSettingsStore()
const toast = useToast()

const canCreate = computed(() => auth.hasPermission('tax_rate.create'))
const canEdit = computed(() => auth.hasPermission('tax_rate.update'))
const canDelete = computed(() => auth.hasPermission('tax_rate.delete'))

const rates = computed(() => settings.taxRates)
onMounted(() => void settings.refreshTaxRates().catch(() => undefined))

// ---- A rate --------------------------------------------------------------------

const editing = ref<TaxRate | null>(null)
const showModal = ref(false)
const saving = ref(false)
const form = reactive({ name: '', percent: 0, active: true })

function newRate() {
  editing.value = null
  Object.assign(form, { name: '', percent: 0, active: true })
  showModal.value = true
}
function editRate(r: TaxRate) {
  editing.value = r
  Object.assign(form, { name: r.name, percent: r.percent, active: r.active })
  showModal.value = true
}

async function saveRate() {
  saving.value = true
  const body = { name: form.name.trim(), percent: Number(form.percent) || 0, active: form.active }
  try {
    if (editing.value) {
      await settingsApi.updateTaxRate(editing.value.id, body)
      toast.success(t('tax.saved', { name: body.name }))
    } else {
      await settingsApi.createTaxRate(body)
      toast.success(t('tax.created', { name: body.name }))
    }
    showModal.value = false
    await settings.refreshTaxRates()
  } catch {
    // toasted by the API client
  } finally {
    saving.value = false
  }
}

async function toggleActive(r: TaxRate) {
  try {
    await settingsApi.updateTaxRate(r.id, { name: r.name, percent: r.percent, active: !r.active })
    await settings.refreshTaxRates()
  } catch {
    // toasted by the API client
  }
}

async function deleteRate(r: TaxRate) {
  try {
    await settingsApi.deleteTaxRate(r.id)
    toast.success(t('tax.deleted', { name: r.name }))
    await settings.refreshTaxRates()
  } catch {
    // toasted by the API client
  }
}

// ---- Where each place starts ------------------------------------------------

const places = [
  { key: 'pos', label: 'tax.placePos' },
  { key: 'invoice', label: 'tax.placeInvoice' },
  { key: 'purchase', label: 'tax.placePurchase' },
  { key: 'expense', label: 'tax.placeExpense' },
] as const
const starting = reactive<TaxDefaults>({ pos: null, invoice: null, purchase: null, expense: null })
watch(
  () => settings.app.taxDefaults,
  (d) => Object.assign(starting, d ?? { pos: null, invoice: null, purchase: null, expense: null }),
  { immediate: true },
)
const startingChanged = computed(() => places.some((p) => starting[p.key] !== (settings.app.taxDefaults?.[p.key] ?? null)))
const savingStarting = ref(false)
async function saveStarting() {
  savingStarting.value = true
  try {
    await settings.saveTaxDefaults({ ...starting })
    toast.success(t('tax.startingSaved'))
  } catch {
    // toasted by the API client
  } finally {
    savingStarting.value = false
  }
}
</script>

<template>
  <div class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
    <div class="card space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 class="font-heading text-base">{{ $t('tax.ratesTitle') }}</h2>
          <p class="text-xs text-muted">{{ $t('tax.ratesHint') }}</p>
        </div>
        <button v-if="canCreate" type="button" class="btn-primary flex items-center gap-2" data-action="new-rate" @click="newRate">
          <Plus :stroke-width="1.8" class="w-4 h-4" /> {{ $t('tax.new') }}
        </button>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted border-b border-line">
              <th class="py-2 font-medium">{{ $t('col.name') }}</th>
              <th class="py-2 pr-4 font-medium text-right">{{ $t('tax.percent') }}</th>
              <th class="py-2 font-medium">{{ $t('col.enabled') }}</th>
              <th class="py-2 font-medium text-right">{{ $t('users.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rates" :key="r.id" class="border-b border-line last:border-0" :data-rate="r.id">
              <td class="py-2">{{ r.name }}</td>
              <td class="py-2 pr-4 text-right font-mono">{{ formatPercent(r.percent) }}</td>
              <td class="py-2">
                <button
                  type="button"
                  role="switch"
                  :aria-checked="r.active"
                  :aria-label="$t('tax.activeAria', { name: r.name })"
                  class="w-9 h-5 rounded-full transition-colors relative disabled:opacity-50"
                  :class="r.active ? 'bg-primary' : 'bg-line'"
                  :disabled="!canEdit"
                  @click="toggleActive(r)"
                >
                  <span class="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" :class="r.active ? 'left-4' : 'left-0.5'" />
                </button>
              </td>
              <td class="py-2">
                <div class="flex items-center justify-end gap-1">
                  <button
                    v-if="canEdit"
                    type="button"
                    class="btn-secondary p-2 flex items-center justify-center"
                    :aria-label="$t('tax.editAria', { name: r.name })"
                    :title="$t('tax.edit')"
                    @click="editRate(r)"
                  >
                    <Pencil class="w-4 h-4" />
                  </button>
                  <ConfirmDelete v-if="canDelete" :item-label="$t('tax.entity')" :item-name="r.name" size="md" @confirm="deleteRate(r)" />
                </div>
              </td>
            </tr>
            <tr v-if="rates.length === 0">
              <td colspan="4" class="py-6 text-center text-muted">{{ $t('tax.noneYet') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card space-y-4 h-fit">
      <div>
        <h2 class="font-heading text-base">{{ $t('tax.startingTitle') }}</h2>
        <p class="text-xs text-muted">{{ $t('tax.startingHint') }}</p>
      </div>
      <TaxSelect
        v-for="p in places"
        :key="p.key"
        v-model="starting[p.key]"
        :label="$t(p.label)"
        :disabled="!canEdit"
        :data-place="p.key"
      />
      <div v-if="canEdit" class="flex justify-end">
        <button type="button" class="btn-primary" data-action="save-starting" :disabled="!startingChanged || savingStarting" @click="saveStarting">
          {{ $t('common.save') }}
        </button>
      </div>
    </div>

    <Modal v-if="showModal" :title="editing ? $t('tax.edit') : $t('tax.new')" @close="showModal = false">
      <form class="space-y-4" @submit.prevent="saveRate">
        <div>
          <label for="tax-name" class="block text-sm text-muted mb-1">{{ $t('col.name') }}</label>
          <input id="tax-name" v-model="form.name" type="text" class="input" maxlength="60" required :placeholder="$t('tax.namePlaceholder')" />
        </div>
        <div>
          <label for="tax-percent" class="block text-sm text-muted mb-1">{{ $t('tax.percent') }}</label>
          <input id="tax-percent" v-model.number="form.percent" type="number" min="0" max="100" step="0.01" class="input font-mono" required />
        </div>
        <label class="flex items-center justify-between text-sm">
          <span>{{ $t('tax.activeLabel') }}</span>
          <input v-model="form.active" type="checkbox" class="rounded" />
        </label>
        <p v-if="editing" class="text-xs text-muted">{{ $t('tax.editHint') }}</p>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="showModal = false">{{ $t('common.cancel') }}</button>
          <button type="submit" class="btn-primary" :disabled="saving">{{ editing ? $t('common.save') : $t('settings.create') }}</button>
        </div>
      </form>
    </Modal>
  </div>
</template>
