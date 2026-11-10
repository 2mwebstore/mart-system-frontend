<script setup lang="ts">
// The alert for a delete the server refused because other records still use
// the record (utils/inUse.ts): what it is, what uses it ("12 POS sales,
// 3 invoices"), and what to do instead. Mounted once, in App.vue.
import { computed } from 'vue'
import { Ban } from 'lucide-vue-next'
import Modal from '@/components/Modal.vue'
import { useInUseAlert } from '@/composables/useInUseAlert'
import type { InUseInfo, InUseUse } from '@/utils/inUse'
import { i18n, localName, t } from '@/i18n'

const { shown, close } = useInUseAlert()

const known = (key: string) => i18n.global.te(key)
function entityLabel(item: InUseInfo) {
  const key = `inUse.entity.${item.entity}`
  return known(key) ? t(key) : ''
}
const nameOf = (item: InUseInfo) => localName(item.name, item.nameKm ?? '')
function useLine(u: InUseUse) {
  const key = `inUse.what.${u.what}`
  return known(key) ? t(key, { n: u.count }, u.count) : `${u.count} ${u.what.replace(/_/g, ' ')}`
}
function hintText(hint?: string) {
  const key = `inUse.hint.${hint}`
  return hint && known(key) ? t(key) : ''
}
// What it is and its name: "product “Coca-Cola”".
function heading(item: InUseInfo) {
  const label = entityLabel(item)
  return label ? t('inUse.named', { label, name: nameOf(item) }) : `“${nameOf(item)}”`
}

const title = computed(() =>
  shown.value.length === 1 ? t('inUse.title', { what: heading(shown.value[0]) }) : t('inUse.titleMany', { n: shown.value.length }),
)
</script>

<template>
  <Modal v-if="shown.length" :title="title" @close="close">
    <div class="space-y-4" data-in-use-alert>
      <section v-for="(item, i) in shown" :key="i" class="flex gap-3" :data-in-use="item.entity">
        <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger text-danger-text">
          <Ban :stroke-width="1.8" class="h-4 w-4" />
        </span>
        <div class="min-w-0 space-y-1.5 text-sm">
          <p v-if="shown.length > 1" class="font-medium">{{ heading(item) }}</p>
          <p class="text-muted">{{ $t('inUse.usedIn') }}</p>
          <ul class="list-disc space-y-0.5 pl-5">
            <li v-for="u in item.uses" :key="u.what" :data-use="u.what">{{ useLine(u) }}</li>
          </ul>
          <p v-if="hintText(item.hint)" class="pt-1">{{ hintText(item.hint) }}</p>
        </div>
      </section>
      <p class="text-xs text-muted">{{ $t('inUse.why') }}</p>
      <div class="flex justify-end">
        <button type="button" class="btn-primary" data-action="in-use-ok" @click="close">{{ $t('inUse.ok') }}</button>
      </div>
    </div>
  </Modal>
</template>
