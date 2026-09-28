<script setup lang="ts">
import { reactive } from 'vue'
import { Ban } from 'lucide-vue-next'
import Modal from '@/components/Modal.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { useAuthStore } from '@/stores/auth'
import { useShiftStore } from '@/stores/shift'
import { pageShiftSales } from '@/api/pos'
import { usePagedList } from '@/composables/usePagedList'
import Pagination from '@/components/Pagination.vue'
import { formatDateTime, formatUSD } from '@/utils/format'
import { useToast } from '@/composables/useToast'
import { label, t } from '@/i18n'

const auth = useAuthStore()
const shift = useShiftStore()
const toast = useToast()
const emit = defineEmits<{ close: []; voided: [] }>()

const canVoid = auth.hasPermission('pos.void')

// This shift's sales, one server page at a time (newest first).
const list = reactive(
  usePagedList(({ page, perPage }) => pageShiftSales(shift.branchId, shift.shift!.id, { page, perPage }), { perPage: 8 }),
)

async function voidSale(id: number, receiptNo: string) {
  if (!canVoid) return
  const reason = window.prompt(t('pos.voidPrompt', { receipt: receiptNo }))
  if (reason === null) return
  try {
    await shift.voidSale(id, reason || t('pos.noReason'))
    toast.success(t('pos.voidedToast', { receipt: receiptNo }))
    await list.reload()
    emit('voided')
  } catch {
    // the API client already toasted the reason
  }
}
</script>

<template>
  <Modal :title="$t('pos.salesThisShift')" wide @close="emit('close')">
    <div v-if="!list.loading && list.total === 0" class="text-center text-muted py-8">{{ $t('pos.noSalesYet') }}</div>
    <table v-else class="w-full text-sm">
      <thead>
        <tr class="text-left text-muted border-b border-line">
          <th class="py-2 font-medium">{{ $t('col.receipt') }}</th>
          <th class="py-2 font-medium">{{ $t('col.time') }}</th>
          <th class="py-2 font-medium text-right">{{ $t('col.items') }}</th>
          <th class="py-2 font-medium">{{ $t('col.payment') }}</th>
          <th class="py-2 font-medium text-right">{{ $t('col.total') }}</th>
          <th class="py-2 font-medium">{{ $t('col.status') }}</th>
          <th class="py-2 font-medium"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in list.rows" :key="s.id" class="border-b border-line last:border-0">
          <td class="py-2 font-mono text-xs">{{ s.receiptNo }}</td>
          <td class="py-2 font-mono text-xs">{{ formatDateTime(s.soldAt).split(' ').slice(-1)[0] }}</td>
          <td class="py-2 text-right font-mono">{{ s.items.reduce((sum, i) => sum + i.qty, 0) }}</td>
          <td class="py-2">{{ label('method', s.payment.method) }}</td>
          <td class="py-2 text-right font-mono">{{ formatUSD(s.totalCents) }}</td>
          <td class="py-2"><StatusBadge :tone="s.status === 'PAID' ? 'success' : 'danger'" :label="label('saleStatus', s.status)" /></td>
          <td class="py-2">
            <button
              v-if="s.status === 'PAID' && canVoid"
              type="button"
              class="p-1.5 text-muted hover:text-danger-strong"
              :aria-label="$t('pos.voidSaleAria')"
              @click="voidSale(s.id, s.receiptNo)"
            >
              <Ban :stroke-width="1.8" class="w-4 h-4" />
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <Pagination v-model:page="list.page" :total-pages="list.totalPages" :total="list.total" :per-page="list.perPage" :noun="$t('pos.sales').toLowerCase()" />
  </Modal>
</template>
