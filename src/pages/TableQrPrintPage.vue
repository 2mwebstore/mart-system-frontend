<script setup lang="ts">
// Printable QR sheet for a branch's tables (opened from Settings > Tables &
// QR): one card per table with its QR code, two per row on A4. The wording
// is printed in both English and Khmer, whatever language the app is in.
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import QRCode from 'qrcode'
import { Printer } from 'lucide-vue-next'
import { listDiningTables } from '@/api/tableOrders'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { useBrandingStore } from '@/stores/branding'
import BrandLogo from '@/components/BrandLogo.vue'
import { t } from '@/i18n'
import type { DiningTable } from '@/types/domain'

const route = useRoute()
const auth = useAuthStore()
const settings = useSettingsStore()
const branding = useBrandingStore()

const branchId = Number(route.query.branch_id)
const onlyIds = new Set(String(route.query.ids ?? '').split(',').filter(Boolean).map(Number))
const branchName = computed(() => auth.branches.find((b) => b.id === branchId)?.name ?? '')
const storeName = computed(() => settings.app.receiptHeader || branding.shortName)

const cards = ref<{ table: DiningTable; url: string; qr: string }[]>([])
const error = ref('')
const loading = ref(true)

function printNow() {
  window.print()
}

onMounted(async () => {
  try {
    const all = await listDiningTables(branchId)
    const chosen = all.filter((x) => x.active && (onlyIds.size === 0 || onlyIds.has(x.id)))
    cards.value = await Promise.all(
      chosen.map(async (table) => {
        const url = `${window.location.origin}/t/${table.token}`
        // High error correction so a scuffed or partly covered sticker still scans.
        const qr = await QRCode.toDataURL(url, { errorCorrectionLevel: 'H', margin: 1, width: 600 })
        return { table, url, qr }
      }),
    )
    document.title = `${storeName.value} · ${t('tables.qrSheetTitle')}`
  } catch {
    error.value = t('tables.qrLoadFailed')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="min-h-screen bg-page print:bg-white">
    <div class="print:hidden sticky top-0 z-10 bg-surface border-b border-line">
      <div class="max-w-4xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="font-heading text-lg">{{ $t('tables.qrSheetTitle') }}</p>
          <p class="text-sm text-muted">{{ branchName }} · {{ $t('tables.qrCount', { n: cards.length }) }}</p>
        </div>
        <button type="button" class="btn-primary flex items-center gap-2" :disabled="cards.length === 0" @click="printNow">
          <Printer :stroke-width="1.8" class="w-4 h-4" /> {{ $t('tables.print') }}
        </button>
      </div>
    </div>

    <p v-if="loading" class="py-16 text-center text-muted">{{ $t('tableMenu.loading') }}</p>
    <p v-else-if="error" class="py-16 text-center text-danger-strong">{{ error }}</p>
    <p v-else-if="cards.length === 0" class="py-16 text-center text-muted">{{ $t('tables.noneToPrint') }}</p>

    <div v-else class="max-w-4xl mx-auto p-4 print:p-0 grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-4 print:gap-0">
      <section
        v-for="c in cards"
        :key="c.table.id"
        class="qr-card bg-white text-black rounded-card border border-line print:rounded-none print:border-dashed p-6 flex flex-col items-center text-center gap-3"
      >
        <BrandLogo class="h-14 max-w-[10rem]" />
        <p class="font-heading text-xl">{{ storeName }}</p>
        <p class="text-sm">{{ branchName }}</p>
        <p class="font-heading text-4xl tracking-wide">{{ c.table.name }}</p>
        <img :src="c.qr" :alt="$t('tables.qrAlt', { name: c.table.name })" class="w-56 h-56" />
        <div class="space-y-0.5">
          <p class="font-medium">Scan to see the menu and order</p>
          <p class="font-medium">ស្កេនដើម្បីមើលម៉ឺនុយ និងកុម្ម៉ង់</p>
        </div>
        <p class="text-[10px] text-gray-500 break-all">{{ c.url }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
@media print {
  @page {
    size: A4;
    margin: 10mm;
  }
  .qr-card {
    break-inside: avoid;
    min-height: 135mm;
    justify-content: center;
  }
}
</style>
