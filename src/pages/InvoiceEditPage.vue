<script setup lang="ts">
// New invoice / edit invoice as its own page (/invoices/new, /invoices/:id/edit)
// rather than a popup — the form is long (customer, dates, items, discounts,
// shipping, note). Saving goes back to the Invoices list.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import * as invoiceApi from '@/api/invoices'
import { listProducts } from '@/api/catalog'
import { listCustomers } from '@/api/people'
import { listPaymentMethods } from '@/api/settings'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import InvoiceForm from '@/components/invoices/InvoiceForm.vue'
import { t } from '@/i18n'
import type { Customer, Invoice, InvoiceInput, PaymentMethodRow, Product } from '@/types/domain'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const toast = useToast()

const editId = computed(() => (route.params.id ? Number(route.params.id) : null))
const invoice = ref<Invoice | null>(null)
const products = ref<Product[]>([])
const customers = ref<Customer[]>([])
const paymentMethods = ref<PaymentMethodRow[]>([])
const loading = ref(true)
const loadError = ref('')
const saving = ref(false)

// An invoice is edited in its own branch; a new one goes to the active branch.
const branchId = computed(() => invoice.value?.branchId ?? auth.activeBranchId ?? auth.branches[0]?.id ?? 1)
const branchName = computed(() => auth.branches.find((b) => b.id === branchId.value)?.name ?? '')

onMounted(async () => {
  try {
    if (editId.value !== null) {
      invoice.value = await invoiceApi.getInvoice(editId.value)
      if (invoice.value.status !== 'OPEN') loadError.value = t('apiErrors.invoiceCancelledChange')
    }
    const [p, c, m] = await Promise.all([listProducts(branchId.value), listCustomers(), listPaymentMethods()])
    products.value = p
    customers.value = c
    paymentMethods.value = m
  } catch {
    loadError.value = t('invoices.loadFailed')
  } finally {
    loading.value = false
  }
})

function back() {
  router.push({ name: 'invoices' })
}

async function save(input: InvoiceInput) {
  saving.value = true
  try {
    const saved = invoice.value ? await invoiceApi.updateInvoice(invoice.value.id, input) : await invoiceApi.createInvoice(input)
    toast.success(invoice.value ? t('invoices.saved', { code: saved.code }) : t('invoices.createdShort', { code: saved.code }))
    back()
  } catch {
    // toasted by the API client
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="p-4 sm:p-8 space-y-6">
    <div class="space-y-2">
      <RouterLink :to="{ name: 'invoices' }" class="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft class="w-4 h-4" /> {{ $t('invoices.backToList') }}
      </RouterLink>
      <div>
        <h1 class="font-heading text-2xl">{{ invoice ? $t('invoices.editTitle', { code: invoice.code }) : $t('invoices.new') }}</h1>
        <p class="text-muted text-sm">{{ branchName }}</p>
      </div>
    </div>

    <p v-if="loading" class="text-muted">{{ $t('tableMenu.loading') }}</p>
    <div v-else-if="loadError" class="card space-y-3">
      <p class="text-danger-strong">{{ loadError }}</p>
      <button type="button" class="btn-secondary" @click="back">{{ $t('invoices.backToList') }}</button>
    </div>
    <div v-else class="card">
      <InvoiceForm
        :invoice="invoice"
        :branch-id="branchId"
        :products="products"
        :customers="customers"
        :payment-methods="paymentMethods"
        :saving="saving"
        @save="save"
        @cancel="back"
      />
    </div>
  </div>
</template>
