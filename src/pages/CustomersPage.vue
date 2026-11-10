<script setup lang="ts">
// Customers per build spec §8 item 8, under Inventory in the sidebar. Also
// where the company picks the customer the POS starts every sale with.
import { computed, onMounted, reactive, ref } from 'vue'
import { Pencil, Plus, ShoppingCart, Star } from 'lucide-vue-next'
import * as peopleApi from '@/api/people'
import type { Customer } from '@/types/domain'
import { formatDate } from '@/utils/format'
import StatusBadge from '@/components/StatusBadge.vue'
import Modal from '@/components/Modal.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import SearchInput from '@/components/SearchInput.vue'
import ConfirmDelete from '@/components/ConfirmDelete.vue'
import Pagination from '@/components/Pagination.vue'
import { useDebounced, usePagedList } from '@/composables/usePagedList'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { useToast } from '@/composables/useToast'
import { label, t } from '@/i18n'

const toast = useToast()
const auth = useAuthStore()
// Create / edit / delete are separate permissions; setting the POS default
// customer is an edit.
const canCreate = auth.hasPermission('customer.create')
const canEdit = auth.hasPermission('customer.update')
const canDelete = auth.hasPermission('customer.delete')
const settings = useSettingsStore()

const search = ref('')
const debouncedSearch = useDebounced(search)
const tierFilter = ref<'all' | 'MEMBER' | 'GOLD'>('all')
// Search and the tier filter run on the server; one page of customers at a time.
const list = reactive(
  usePagedList(
    ({ page, perPage }) =>
      peopleApi.pageCustomers({ page, perPage, q: debouncedSearch.value.trim(), tier: tierFilter.value === 'all' ? null : tierFilter.value }),
    { deps: [debouncedSearch, tierFilter] },
  ),
)
const load = () => list.reload()

const tierOptions = computed(() => [
  { value: 'MEMBER', label: label('tier', 'MEMBER') },
  { value: 'GOLD', label: label('tier', 'GOLD') },
])
const tierFilterOptions = computed(() => [{ value: 'all', label: t('customers.allTiers') }, ...tierOptions.value])

const showModal = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const form = reactive({ name: '', phone: '', tier: 'MEMBER' as 'MEMBER' | 'GOLD' })

function newCustomer() {
  editingId.value = null
  Object.assign(form, { name: '', phone: '', tier: 'MEMBER' })
  showModal.value = true
}
function editCustomer(c: Customer) {
  editingId.value = c.id
  Object.assign(form, { name: c.name, phone: c.phone, tier: c.tier })
  showModal.value = true
}
async function submitForm() {
  saving.value = true
  try {
    if (editingId.value === null) {
      await peopleApi.createCustomer({ ...form })
      toast.success(t('customers.added'))
    } else {
      await peopleApi.updateCustomer(editingId.value, { ...form })
      toast.success(t('customers.updated'))
      if (editingId.value === defaultId.value) void refreshDefault()
    }
    showModal.value = false
    await load()
  } catch {
    // the API client already toasted the reason
  } finally {
    saving.value = false
  }
}
async function deleteCustomer(id: number) {
  try {
    await peopleApi.deleteCustomer(id)
    toast.success(t('customers.deleted'))
    await load()
    // Deleting the POS default puts the POS back on walk-in (server-side).
    if (id === defaultId.value) await refreshDefault()
  } catch {
    // toasted by the API client
  }
}

// --- The POS's default customer ---------------------------------------------
// One per company; the POS starts every new sale with them (the cashier can
// still change it for a sale). Re-read on opening, as someone else may have
// changed it since this session loaded the settings.
const defaultId = computed(() => settings.app.defaultCustomerId)
const savingDefault = ref(false)
const refreshDefault = () => settings.load().catch(() => {})
onMounted(refreshDefault)

async function setDefault(c: Customer | null) {
  savingDefault.value = true
  try {
    await settings.saveDefaultCustomer(c?.id ?? null)
    toast.success(c ? t('customers.posDefaultSet', { name: c.name }) : t('customers.posDefaultCleared'))
  } catch {
    // toasted by the API client
  } finally {
    savingDefault.value = false
  }
}
</script>

<template>
  <div class="p-4 sm:p-8 space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <h1 class="font-heading text-2xl">{{ $t('customers.title') }}</h1>
      <button v-if="canCreate" type="button" class="btn-primary flex items-center gap-2" @click="newCustomer">
        <Plus :stroke-width="1.8" class="w-4 h-4" /> {{ $t('customers.new') }}
      </button>
    </div>

    <!-- Who the POS starts every sale with. -->
    <div class="card flex flex-wrap items-center gap-4">
      <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-primary-tint text-primary-tint-text">
        <ShoppingCart :stroke-width="1.8" class="h-5 w-5" />
      </span>
      <div class="min-w-0 flex-1 basis-60">
        <h2 class="font-heading text-base">{{ $t('customers.posDefaultTitle') }}</h2>
        <p class="text-sm text-muted">
          <template v-if="defaultId">{{ $t('customers.posDefaultIs', { name: settings.app.defaultCustomerName }) }}</template>
          <template v-else>{{ $t('customers.posDefaultNone') }}</template>
        </p>
      </div>
      <button v-if="canEdit && defaultId" type="button" class="btn-secondary text-sm" :disabled="savingDefault" @click="setDefault(null)">
        {{ $t('customers.useWalkIn') }}
      </button>
    </div>

    <div class="card space-y-4">
      <div class="list-filters">
        <SearchInput v-model="search" :placeholder="$t('customers.searchPlaceholder')" class="sm:w-72" />
        <SearchableSelect v-model="tierFilter" class="w-full sm:w-44" :options="tierFilterOptions" :searchable="false" :clearable="false" />
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted border-b border-line">
              <th class="py-2 font-medium">{{ $t('col.name') }}</th>
              <th class="py-2 font-medium">{{ $t('col.phone') }}</th>
              <th class="py-2 font-medium">{{ $t('col.tier') }}</th>
              <th class="py-2 pr-4 font-medium text-right">{{ $t('col.points') }}</th>
              <th class="py-2 font-medium">{{ $t('col.lastVisit') }}</th>
              <th class="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in list.rows" :key="c.id" class="border-b border-line last:border-0 hover:bg-surface-subtle">
              <td class="py-2">
                <span class="flex flex-wrap items-center gap-2">
                  {{ c.name }}
                  <span v-if="c.id === defaultId" class="rounded-control bg-primary-tint px-2 py-0.5 text-xs font-medium text-primary-tint-text">
                    {{ $t('customers.posDefaultBadge') }}
                  </span>
                </span>
              </td>
              <td class="py-2 font-mono">{{ c.phone }}</td>
              <td class="py-2"><StatusBadge :tone="c.tier === 'GOLD' ? 'warning' : 'neutral'" :label="label('tier', c.tier)" /></td>
              <td class="py-2 pr-4 text-right font-mono">{{ c.points.toLocaleString() }}</td>
              <td class="py-2 font-mono text-xs text-muted">{{ formatDate(c.lastVisit) }}</td>
              <td class="py-2">
                <div v-if="canEdit || canDelete" class="flex items-center gap-1">
                  <!-- Star: this customer is (filled) or becomes the POS default. -->
                  <button
                    v-if="canEdit"
                    type="button"
                    class="p-1.5 transition"
                    :class="c.id === defaultId ? 'text-primary hover:text-primary-text' : 'text-muted hover:text-ink'"
                    :disabled="savingDefault"
                    :aria-pressed="c.id === defaultId"
                    :aria-label="c.id === defaultId ? $t('customers.unsetPosDefault', { name: c.name }) : $t('customers.setPosDefault', { name: c.name })"
                    :title="c.id === defaultId ? $t('customers.unsetPosDefault', { name: c.name }) : $t('customers.setPosDefault', { name: c.name })"
                    @click="setDefault(c.id === defaultId ? null : c)"
                  >
                    <Star :stroke-width="1.8" class="w-4 h-4" :class="{ 'fill-current': c.id === defaultId }" />
                  </button>
                  <button v-if="canEdit" type="button" class="p-1.5 text-muted hover:text-ink" :aria-label="$t('customers.editAria')" @click="editCustomer(c)">
                    <Pencil :stroke-width="1.8" class="w-4 h-4" />
                  </button>
                  <ConfirmDelete v-if="canDelete" :item-label="$t('entity.customer')" :item-name="c.name" @confirm="deleteCustomer(c.id)" />
                </div>
              </td>
            </tr>
            <tr v-if="!list.loading && list.rows.length === 0">
              <td colspan="6" class="py-6 text-center text-muted">{{ $t('customers.none') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <Pagination v-model:page="list.page" :total-pages="list.totalPages" :total="list.total" :per-page="list.perPage" :noun="$t('customers.noun')" />
    </div>

    <Modal v-if="showModal" :title="editingId === null ? $t('customers.new') : $t('customers.edit')" @close="showModal = false">
      <form class="space-y-4" @submit.prevent="submitForm">
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('common.name') }}</label>
          <input v-model="form.name" type="text" class="input" required />
        </div>
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('common.phone') }}</label>
          <input v-model="form.phone" type="text" class="input" required />
        </div>
        <SearchableSelect v-model="form.tier" :label="$t('customers.tier')" :options="tierOptions" :searchable="false" :clearable="false" />
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="showModal = false">{{ $t('common.cancel') }}</button>
          <button type="submit" class="btn-primary" :disabled="saving">{{ editingId === null ? $t('customers.addCta') : $t('common.save') }}</button>
        </div>
      </form>
    </Modal>
  </div>
</template>
