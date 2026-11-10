<script setup lang="ts">
import { ref } from 'vue'
import { Eye, EyeOff } from 'lucide-vue-next'

// A password field with a button that shows what was typed, and hides it
// again. The button doesn't submit the form, and the field starts hidden.
defineOptions({ inheritAttrs: false })
const model = defineModel<string>({ required: true })
defineProps<{ id: string }>()
const shown = ref(false)
</script>

<template>
  <div class="relative">
    <input :id="id" v-model="model" v-bind="$attrs" :type="shown ? 'text' : 'password'" class="input pr-10" />
    <button
      type="button"
      class="absolute inset-y-0 right-0 flex items-center px-3 text-muted hover:text-ink"
      :aria-label="shown ? $t('auth.hidePassword') : $t('auth.showPassword')"
      :title="shown ? $t('auth.hidePassword') : $t('auth.showPassword')"
      :aria-pressed="shown"
      :aria-controls="id"
      @click="shown = !shown"
    >
      <EyeOff v-if="shown" :stroke-width="1.8" class="w-4 h-4" />
      <Eye v-else :stroke-width="1.8" class="w-4 h-4" />
    </button>
  </div>
</template>
