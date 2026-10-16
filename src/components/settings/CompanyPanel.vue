<script setup lang="ts">
// Settings > Company: the company's name (replaces "Com Mart Control System"
// in the sidebar, sign-in pages and browser tab) and its logo — an uploaded
// image (chosen, dropped or pasted; shrunk to 512 px in the browser, keeping
// transparency) or a web link. Saving goes through the branding store, so the
// sidebar and tab update straight away.
import { computed, onMounted, ref } from 'vue'
import { ImageUp, Link2, Trash2 } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useBrandingStore } from '@/stores/branding'
import { useSettingsStore } from '@/stores/settings'
import { useToast } from '@/composables/useToast'
import { shrinkLogo } from '@/utils/image'
import { t } from '@/i18n'

const auth = useAuthStore()
const branding = useBrandingStore()
const settings = useSettingsStore()
const toast = useToast()
const canManage = auth.hasPermission('branch.manage')

const name = ref('')
const mode = ref<'image' | 'link'>('image')
const image = ref('') // a newly chosen image (data URL), not saved yet
const removed = ref(false) // the saved uploaded logo is to be removed
const link = ref('')
const saving = ref(false)

function reset() {
  name.value = branding.companyName
  mode.value = branding.logoLink ? 'link' : 'image'
  image.value = ''
  removed.value = false
  link.value = branding.logoLink
}
onMounted(async () => {
  reset()
  await branding.refresh()
  reset()
})

const linkOk = computed(() => !link.value.trim() || /^https?:\/\//i.test(link.value.trim()))
// A new logo in the form (an image just chosen, or a link typed), if any.
const fresh = computed(() => (mode.value === 'link' ? (linkOk.value ? link.value.trim() : '') : image.value))
// Remove pressed, or the saved link cleared out.
const removing = computed(() => removed.value || (mode.value === 'link' && !link.value.trim() && !!branding.logoLink))
const preview = computed(() => fresh.value || (removing.value ? '' : branding.logoUrl))

// What to send as `logo`: undefined keeps the saved one. Switching between
// Upload and Link alone changes nothing — only a new logo or Remove does.
const logoPayload = computed<string | undefined>(() => {
  if (fresh.value) return fresh.value === branding.logoLink ? undefined : fresh.value
  return removing.value ? '' : undefined
})
const dirty = computed(() => name.value.trim() !== branding.companyName || logoPayload.value !== undefined)

// ---- Image: choose, drop or paste ---------------------------------------------
const preparing = ref(false)
const dragging = ref(false)
async function useFile(file: File | null | undefined) {
  if (!file) return
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    toast.error(t('settings.logoNotImage'))
    return
  }
  preparing.value = true
  try {
    image.value = await shrinkLogo(file)
    removed.value = false
  } catch {
    toast.error(t('settings.logoNotImage'))
  } finally {
    preparing.value = false
  }
}
function pick(e: Event) {
  const input = e.target as HTMLInputElement
  void useFile(input.files?.[0]).finally(() => (input.value = ''))
}
function onDrop(e: DragEvent) {
  dragging.value = false
  void useFile(e.dataTransfer?.files?.[0])
}
function onPaste(e: ClipboardEvent) {
  const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
  if (file) {
    e.preventDefault()
    void useFile(file)
  }
}
function removeLogo() {
  link.value = ''
  image.value = ''
  removed.value = true
}

async function save() {
  if (!linkOk.value || preparing.value) return
  saving.value = true
  try {
    await branding.save(name.value.trim(), logoPayload.value)
    reset()
    // The receipt header may have followed the new name (see UpdateBranding).
    void settings.load().catch(() => undefined)
    toast.success(t('settings.companySaved'))
  } catch {
    // toasted by the API client
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
    <form class="card space-y-5" @submit.prevent="save">
      <div>
        <h2 class="font-heading text-base">{{ $t('settings.companyTitle') }}</h2>
        <p class="text-xs text-muted mt-1">{{ $t('settings.companyIntro', { default: $t('app.name') }) }}</p>
      </div>

      <div>
        <label for="company-name" class="block text-sm text-muted mb-1">{{ $t('settings.companyName') }}</label>
        <input id="company-name" v-model="name" type="text" maxlength="80" class="input" :placeholder="$t('app.name')" :disabled="!canManage" />
        <p class="text-xs text-muted mt-1">{{ $t('settings.companyNameHint', { default: $t('app.name') }) }}</p>
      </div>

      <div class="space-y-2">
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm text-muted">{{ $t('settings.logo') }}</span>
          <div class="flex rounded-control border border-line overflow-hidden text-xs" role="group" :aria-label="$t('settings.logo')">
            <button type="button" class="px-2 py-1 flex items-center gap-1" :class="mode === 'image' ? 'bg-primary text-primary-ink' : 'text-muted'" :aria-pressed="mode === 'image'" :disabled="!canManage" @click="mode = 'image'">
              <ImageUp class="w-3.5 h-3.5" /> {{ $t('settings.logoUpload') }}
            </button>
            <button type="button" class="px-2 py-1 flex items-center gap-1" :class="mode === 'link' ? 'bg-primary text-primary-ink' : 'text-muted'" :aria-pressed="mode === 'link'" :disabled="!canManage" @click="mode = 'link'">
              <Link2 class="w-3.5 h-3.5" /> {{ $t('settings.logoLink') }}
            </button>
          </div>
        </div>

        <div v-if="mode === 'link'" class="space-y-1">
          <input v-model="link" type="url" class="input" placeholder="https://…" :aria-label="$t('settings.logoLink')" :disabled="!canManage" />
          <p v-if="!linkOk" class="text-xs text-danger-strong">{{ $t('settings.logoLinkInvalid') }}</p>
        </div>
        <div
          v-else
          tabindex="0"
          class="rounded-control border-2 border-dashed p-3 flex flex-wrap items-center gap-4 outline-none focus:border-primary"
          :class="dragging ? 'border-primary bg-primary-tint' : 'border-line'"
          :aria-label="$t('settings.logoDrop')"
          data-logo-drop
          @dragover.prevent="canManage && (dragging = true)"
          @dragleave="dragging = false"
          @drop.prevent="canManage && onDrop($event)"
          @paste="canManage && onPaste($event)"
        >
          <div class="logo-checker h-20 w-36 shrink-0 rounded-control border border-line flex items-center justify-center overflow-hidden">
            <img v-if="preview" :src="preview" alt="" class="max-h-full max-w-full object-contain p-1" />
            <span v-else class="text-xs text-muted">{{ $t('settings.logoNone') }}</span>
          </div>
          <div class="min-w-0 space-y-1.5">
            <p class="text-sm text-muted">{{ preparing ? $t('settings.logoPreparing') : $t('settings.logoDrop') }}</p>
            <label class="relative btn-secondary text-sm inline-flex" :class="canManage ? 'cursor-pointer' : 'opacity-50 pointer-events-none'">
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="sr-only" :disabled="!canManage" data-logo-file @change="pick" />
              {{ preview ? $t('settings.logoChange') : $t('settings.logoChoose') }}
            </label>
          </div>
        </div>
        <p class="text-xs text-muted">{{ $t('settings.logoHint') }}</p>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2">
        <button v-if="preview && canManage" type="button" class="text-sm text-danger-strong hover:underline inline-flex items-center gap-1" @click="removeLogo">
          <Trash2 :stroke-width="1.8" class="w-4 h-4" /> {{ $t('settings.logoRemove') }}
        </button>
        <span v-else />
        <button type="submit" class="btn-primary" :disabled="!canManage || saving || preparing || !linkOk || !dirty">{{ $t('common.save') }}</button>
      </div>
    </form>

    <!-- How it will look: the sidebar header and the sign-in page -->
    <div class="card space-y-3">
      <h2 class="font-heading text-base">{{ $t('settings.logoPreview') }}</h2>
      <div class="rounded-card bg-sidebar text-white px-5 py-5 flex items-center gap-2.5" data-brand-preview>
        <span v-if="preview" class="h-10 max-w-[5.5rem] bg-white rounded-control p-1 inline-flex shrink-0 items-center justify-center">
          <img :src="preview" alt="" class="h-full w-auto max-w-full object-contain" />
        </span>
        <p class="font-heading text-lg leading-tight break-words min-w-0">{{ name.trim() || $t('app.name') }}</p>
      </div>
      <div class="rounded-card bg-page border border-line px-5 py-6 text-center">
        <span v-if="preview" class="inline-flex h-20 max-w-[14rem] mb-3">
          <img :src="preview" alt="" class="h-full w-auto max-w-full object-contain" />
        </span>
        <p class="font-heading text-2xl text-ink">{{ name.trim() || $t('app.name') }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* A light checkerboard so a transparent logo's edges are visible. */
.logo-checker {
  background-color: #fff;
  background-image:
    linear-gradient(45deg, #eee 25%, transparent 25%),
    linear-gradient(-45deg, #eee 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #eee 75%),
    linear-gradient(-45deg, transparent 75%, #eee 75%);
  background-size: 12px 12px;
  background-position: 0 0, 0 6px, 6px -6px, -6px 0;
}
</style>
