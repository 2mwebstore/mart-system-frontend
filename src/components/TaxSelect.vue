<script setup lang="ts">
// The Tax picker on a POS sale, invoice, purchase order or expense: "No tax"
// and the company's active rates. A document being edited also lists its own
// rate as it was kept, even if that rate has since changed or been switched
// off (the server keeps it the same way). v-model is the rate's id, or null.
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { formatPercent, type KeptRate } from '@/utils/tax'
import { t } from '@/i18n'
import SearchableSelect from '@/components/SearchableSelect.vue'

const props = withDefaults(defineProps<{ modelValue: number | null; kept?: KeptRate | null; label?: string; disabled?: boolean }>(), {
  kept: null,
  label: undefined,
  disabled: false,
})
const emit = defineEmits<{ 'update:modelValue': [number | null] }>()

const settings = useSettingsStore()

const NONE = 0
const options = computed(() => {
  const own = props.kept?.taxRateId ?? null
  const rates = settings.taxRates.filter((r) => r.active && r.id !== own).map((r) => ({ value: r.id, label: r.name, sub: formatPercent(r.percent) }))
  const kept = own && props.kept ? [{ value: own, label: props.kept.taxName, sub: formatPercent(props.kept.taxPercent) }] : []
  return [{ value: NONE, label: t('tax.none') }, ...kept, ...rates]
})
</script>

<template>
  <SearchableSelect
    :model-value="modelValue ?? NONE"
    :options="options"
    :label="label ?? $t('tax.label')"
    :clearable="false"
    :searchable="options.length > 6"
    :disabled="disabled"
    @update:model-value="(v) => emit('update:modelValue', Number(v) || null)"
  />
</template>
