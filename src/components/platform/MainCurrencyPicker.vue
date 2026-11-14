<script setup lang="ts">
// What a company prices, sells and reports in, as the super admin sets it
// when making or editing a company: US dollars or riel. Once the company has
// amounts stored (products with prices, sales, invoices…) it's locked.
import type { Currency } from '@/types/domain'

// name: the radio group's name, one per form. locked: it can't change any more.
defineProps<{ name: string; locked?: boolean }>()
const currency = defineModel<Currency>({ required: true })
const CURRENCIES: Currency[] = ['USD', 'KHR']
</script>

<template>
  <fieldset class="space-y-2" :disabled="locked" data-main-currency>
    <legend class="sr-only">{{ $t('platform.mainCurrency') }}</legend>
    <p class="text-sm font-medium" aria-hidden="true">{{ $t('platform.mainCurrency') }}</p>
    <p class="text-xs text-muted">{{ $t('platform.mainCurrencyHint') }}</p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <label
        v-for="c in CURRENCIES"
        :key="c"
        class="flex gap-2.5 rounded-control border p-3 transition-colors"
        :class="[
          currency === c ? 'border-primary bg-primary-tint' : 'border-line',
          locked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
          !locked && currency !== c ? 'hover:bg-surface-subtle' : '',
        ]"
      >
        <input v-model="currency" type="radio" :name="name" :value="c" class="mt-0.5 shrink-0" :data-main-currency-option="c" />
        <span>
          <span class="block text-sm font-medium">{{ $t(`platform.mainCurrency${c}`) }}</span>
          <span class="block text-xs text-muted mt-0.5">{{ $t(`platform.mainCurrency${c}Hint`) }}</span>
        </span>
      </label>
    </div>
    <p v-if="locked" class="text-xs text-warning-text" data-main-currency-locked>{{ $t('platform.mainCurrencyLocked') }}</p>
  </fieldset>
</template>
