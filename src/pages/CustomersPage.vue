<script setup lang="ts">
// Customers per build spec §8 item 8. Not in the primary sidebar nav (§4
// lists exactly 8 items), reached from the sidebar's secondary links.
import { computed, reactive, ref } from 'vue'
import { Pencil, Plus, Search } from 'lucide-vue-next'
import * as peopleApi from '@/api/people'
import type { Customer } from '@/types/domain'
import { formatDate } from '@/utils/format'
import StatusBadge from '@/components/StatusBadge.vue'
import Modal from '@/components/Modal.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import ConfirmDelete from '@/components/ConfirmDelete.vue'
import Pagination from '@/components/Pagination.vue'
import { useDebounced, usePagedList } from '@/composables/usePagedList'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { label, t } from '@/i18n'

const toast = useToast()
const auth = useAuthStore()
const canManage = auth.hasPermission('customer.manage')

const search = ref('')
const debouncedSearch = useDebounced(search)
// Search runs on the server; one page of customers at a time.
const list = reactive(
  usePagedList(({ page, perPage }) => peopleApi.pageCustomers({ page, perPage, q: debouncedSearch.value.trim() }), {
    deps: [debouncedSearch],
  }),
)
const load = () => list.reload()

const tierOptions = computed(() => [
  { value: 'MEMBER', label: label('tier', 'MEMBER') },
  { value: 'GOLD', label: label('tier', 'GOLD') },
])

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
  } catch {
    // toasted by the API client
  }
}
</script>

<template>
  <div class="p-4 sm:p-8 space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <h1 class="font-heading text-2xl">{{ $t('customers.title') }}</h1>
      <button v-if="canManage" type="button" class="btn-primary flex items-center gap-2" @click="newCustomer">
        <Plus :stroke-width="1.8" class="w-4 h-4" /> {{ $t('customers.new') }}
      </button>
    </div>

    <div class="card space-y-4">
      <div class="relative max-w-xs">
        <Search :stroke-width="1.8" class="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
        <input v-model="search" type="search" :placeholder="$t('customers.searchPlaceholder')" class="input pl-9" />
      </div>

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
            <td class="py-2">{{ c.name }}</td>
            <td class="py-2 font-mono">{{ c.phone }}</td>
            <td class="py-2"><StatusBadge :tone="c.tier === 'GOLD' ? 'warning' : 'neutral'" :label="label('tier', c.tier)" /></td>
            <td class="py-2 pr-4 text-right font-mono">{{ c.points.toLocaleString() }}</td>
            <td class="py-2 font-mono text-xs text-muted">{{ formatDate(c.lastVisit) }}</td>
            <td class="py-2">
              <div v-if="canManage" class="flex items-center gap-1">
                <button type="button" class="p-1.5 text-muted hover:text-ink" :aria-label="$t('customers.editAria')" @click="editCustomer(c)">
                  <Pencil :stroke-width="1.8" class="w-4 h-4" />
                </button>
                <ConfirmDelete :item-label="$t('entity.customer')" :item-name="c.name" @confirm="deleteCustomer(c.id)" />
              </div>
            </td>
          </tr>
          <tr v-if="!list.loading && list.rows.length === 0">
            <td colspan="6" class="py-6 text-center text-muted">{{ $t('customers.none') }}</td>
          </tr>
        </tbody>
      </table>
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
