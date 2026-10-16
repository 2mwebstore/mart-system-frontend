<script setup lang="ts">
// Settings > Tables & QR: a branch's tables, each with the QR customers scan
// to order (see TableMenuPage). Printing opens a separate sheet page.
import { computed, ref, watch } from 'vue'
import { ExternalLink, Pencil, Plus, Printer, RefreshCw } from 'lucide-vue-next'
import * as tableApi from '@/api/tableOrders'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import SearchableSelect from '@/components/SearchableSelect.vue'
import ConfirmDelete from '@/components/ConfirmDelete.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import Modal from '@/components/Modal.vue'
import { t } from '@/i18n'
import type { DiningTable } from '@/types/domain'

const auth = useAuthStore()
const toast = useToast()

const branchId = ref<number | null>(auth.activeBranchId ?? auth.branches[0]?.id ?? null)
const branchOptions = computed(() => auth.branches.map((b) => ({ value: b.id, label: b.name, sub: b.code })))
const tables = ref<DiningTable[]>([])
const loading = ref(false)

async function load() {
  if (!branchId.value) return
  loading.value = true
  try {
    tables.value = await tableApi.listDiningTables(branchId.value)
  } catch {
    // toasted by the API client
  } finally {
    loading.value = false
  }
}
watch(branchId, () => void load(), { immediate: true })

// QR codes point at the address this page is open on — print them from the
// shop's real web address, not from localhost.
const exampleUrl = `${window.location.origin}/t/…`
function menuUrl(tbl: DiningTable) {
  return `${window.location.origin}/t/${tbl.token}`
}
function printSheet(ids?: number[]) {
  if (!branchId.value) return
  const q = new URLSearchParams({ branch_id: String(branchId.value) })
  if (ids?.length) q.set('ids', ids.join(','))
  window.open(`/print/table-qr?${q}`, '_blank')
}

// ---- Add: one table, or a numbered range ------------------------------------
const newName = ref('')
const range = ref({ prefix: 'T', from: 1, to: 10 })
const saving = ref(false)
async function addOne() {
  if (!branchId.value || !newName.value.trim()) return
  saving.value = true
  try {
    await tableApi.createDiningTable({ branchId: branchId.value, name: newName.value.trim(), active: true })
    toast.success(t('tables.created', { name: newName.value.trim() }))
    newName.value = ''
    await load()
  } catch {
    // toasted
  } finally {
    saving.value = false
  }
}
async function addRange() {
  if (!branchId.value) return
  saving.value = true
  try {
    const res = await tableApi.createDiningTablesBulk({ branchId: branchId.value, prefix: range.value.prefix, from: Number(range.value.from), to: Number(range.value.to) })
    toast.success(t('tables.createdMany', { n: res.created }))
    await load()
  } catch {
    // toasted
  } finally {
    saving.value = false
  }
}

// ---- Edit -----------------------------------------------------------------
const editing = ref<DiningTable | null>(null)
const editForm = ref({ name: '', active: true })
function edit(tbl: DiningTable) {
  editing.value = tbl
  editForm.value = { name: tbl.name, active: tbl.active }
}
async function saveEdit(rotateToken = false) {
  const tbl = editing.value
  if (!tbl) return
  if (rotateToken && !window.confirm(t('tables.rotateConfirm', { name: tbl.name }))) return
  saving.value = true
  try {
    await tableApi.updateDiningTable(tbl.id, { branchId: tbl.branchId, name: editForm.value.name.trim(), active: editForm.value.active, rotateToken })
    toast.success(rotateToken ? t('tables.rotated', { name: tbl.name }) : t('tables.saved'))
    editing.value = null
    await load()
  } catch {
    // toasted
  } finally {
    saving.value = false
  }
}
async function remove(tbl: DiningTable) {
  try {
    await tableApi.deleteDiningTable(tbl.id)
    toast.success(t('tables.deleted', { name: tbl.name }))
    await load()
  } catch {
    // toasted
  }
}
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
    <div class="card lg:col-span-2 space-y-4">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <SearchableSelect v-model="branchId" class="w-full sm:w-56" :label="$t('common.branch')" :options="branchOptions" :clearable="false" />
        <button type="button" class="btn-primary flex items-center gap-2" :disabled="tables.length === 0" @click="printSheet()">
          <Printer :stroke-width="1.8" class="w-4 h-4" /> {{ $t('tables.printAll') }}
        </button>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted border-b border-line">
              <th class="py-2 font-medium">{{ $t('tables.table') }}</th>
              <th class="py-2 font-medium">{{ $t('col.status') }}</th>
              <th class="py-2 font-medium text-right">{{ $t('tables.openOrders') }}</th>
              <th class="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="tbl in tables" :key="tbl.id" class="border-b border-line last:border-0">
              <td class="py-2 font-medium">{{ tbl.name }}</td>
              <td class="py-2">
                <StatusBadge :tone="tbl.active ? 'success' : 'neutral'" :label="tbl.active ? $t('common.active') : $t('tables.paused')" />
              </td>
              <td class="py-2 text-right font-mono">{{ tbl.openOrders }}</td>
              <td class="py-2">
                <div class="flex items-center justify-end gap-1">
                  <a :href="menuUrl(tbl)" target="_blank" rel="noopener" class="p-1.5 text-muted hover:text-ink" :aria-label="$t('tables.openMenu', { name: tbl.name })" :title="$t('tables.openMenu', { name: tbl.name })">
                    <ExternalLink :stroke-width="1.8" class="w-4 h-4" />
                  </a>
                  <button type="button" class="p-1.5 text-muted hover:text-ink" :aria-label="$t('tables.printOne', { name: tbl.name })" :title="$t('tables.printOne', { name: tbl.name })" @click="printSheet([tbl.id])">
                    <Printer :stroke-width="1.8" class="w-4 h-4" />
                  </button>
                  <button type="button" class="p-1.5 text-muted hover:text-ink" :aria-label="$t('tables.edit', { name: tbl.name })" @click="edit(tbl)">
                    <Pencil :stroke-width="1.8" class="w-4 h-4" />
                  </button>
                  <ConfirmDelete :item-label="$t('tables.table')" :item-name="tbl.name" @confirm="remove(tbl)" />
                </div>
              </td>
            </tr>
            <tr v-if="!loading && tables.length === 0">
              <td colspan="4" class="py-6 text-center text-muted">{{ $t('tables.none') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-xs text-muted">{{ $t('tables.urlHint', { url: exampleUrl }) }}</p>
    </div>

    <div class="space-y-4">
      <form class="card space-y-3" @submit.prevent="addOne">
        <h2 class="font-heading text-base">{{ $t('tables.addOne') }}</h2>
        <div>
          <label class="block text-sm text-muted mb-1" for="table-name">{{ $t('tables.name') }}</label>
          <input id="table-name" v-model="newName" type="text" maxlength="40" class="input" :placeholder="$t('tables.nameHint')" />
        </div>
        <button type="submit" class="btn-secondary w-full flex items-center justify-center gap-2" :disabled="saving || !newName.trim()">
          <Plus :stroke-width="1.8" class="w-4 h-4" /> {{ $t('tables.add') }}
        </button>
      </form>
      <form class="card space-y-3" @submit.prevent="addRange">
        <h2 class="font-heading text-base">{{ $t('tables.addRange') }}</h2>
        <div class="grid grid-cols-3 gap-2">
          <div>
            <label class="block text-xs text-muted mb-1" for="range-prefix">{{ $t('tables.prefix') }}</label>
            <input id="range-prefix" v-model="range.prefix" type="text" maxlength="30" class="input" />
          </div>
          <div>
            <label class="block text-xs text-muted mb-1" for="range-from">{{ $t('tables.from') }}</label>
            <input id="range-from" v-model.number="range.from" type="number" min="1" class="input" />
          </div>
          <div>
            <label class="block text-xs text-muted mb-1" for="range-to">{{ $t('tables.to') }}</label>
            <input id="range-to" v-model.number="range.to" type="number" min="1" class="input" />
          </div>
        </div>
        <p class="text-xs text-muted">{{ $t('tables.rangePreview', { first: `${range.prefix}${range.from}`, last: `${range.prefix}${range.to}` }) }}</p>
        <button type="submit" class="btn-secondary w-full" :disabled="saving">{{ $t('tables.addMany') }}</button>
      </form>
    </div>

    <Modal v-if="editing" :title="$t('tables.edit', { name: editing.name })" @close="editing = null">
      <form class="space-y-4" @submit.prevent="saveEdit(false)">
        <div>
          <label class="block text-sm text-muted mb-1" for="edit-table-name">{{ $t('tables.name') }}</label>
          <input id="edit-table-name" v-model="editForm.name" type="text" maxlength="40" class="input" required />
        </div>
        <label class="flex items-center justify-between text-sm">
          <span>{{ $t('tables.acceptOrders') }}</span>
          <input v-model="editForm.active" type="checkbox" class="rounded" />
        </label>
        <div class="rounded-control border border-line p-3 space-y-2">
          <p class="text-sm">{{ $t('tables.rotateHint') }}</p>
          <button type="button" class="btn-secondary text-sm flex items-center gap-2" :disabled="saving" @click="saveEdit(true)">
            <RefreshCw :stroke-width="1.8" class="w-4 h-4" /> {{ $t('tables.rotate') }}
          </button>
        </div>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-secondary" @click="editing = null">{{ $t('common.cancel') }}</button>
          <button type="submit" class="btn-primary" :disabled="saving">{{ $t('common.save') }}</button>
        </div>
      </form>
    </Modal>
  </div>
</template>
