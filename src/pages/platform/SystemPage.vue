<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Download, Send } from 'lucide-vue-next'
import * as platformApi from '@/api/platform'
import { PLATFORM_ALERT_TYPES, type AlertType, type BackupRow } from '@/types/domain'
import StatusBadge from '@/components/StatusBadge.vue'
import Modal from '@/components/Modal.vue'
import ConfirmDelete from '@/components/ConfirmDelete.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import Pagination from '@/components/Pagination.vue'
import { useLocalList } from '@/composables/useLocalList'
import { useToast } from '@/composables/useToast'
import { useBrandingStore } from '@/stores/branding'
import { FOOTER_YEAR, footerLine } from '@/utils/footer'
import { formatDateTime } from '@/utils/format'
import { t } from '@/i18n'

// The tools that cover every company at once, so they're the super admin's:
// the footer under every page, database backups, the Telegram alerts about
// them, and the production reset.
// (Each company keeps its own alerts, numbering and retention in Settings.)
const toast = useToast()

onMounted(() => {
  void Promise.allSettled([loadFooter(), loadNotify(), loadBackups()])
})

// --- The footer under every page -----------------------------------------------
// One line for every company (a copyright); "{year}" shows the current year.

const branding = useBrandingStore()
const footerText = ref('')
const savingFooter = ref(false)
const footerPreview = computed(() => footerLine(footerText.value))

async function loadFooter() {
  footerText.value = (await platformApi.getFooter()).text
}
async function saveFooter() {
  savingFooter.value = true
  try {
    const saved = await platformApi.updateFooter(footerText.value)
    footerText.value = saved.text
    branding.setFooterText(saved.text)
    toast.success(t('platform.footerSaved'))
  } catch {
    // the API client already toasted the reason
  } finally {
    savingFooter.value = false
  }
}

// --- Telegram alerts about backups --------------------------------------------

const notifyForm = reactive({ enabled: false, botToken: '', chatId: '', alertTypes: [] as AlertType[] })
const savingNotify = ref(false)
const testingAlert = ref(false)

async function loadNotify() {
  Object.assign(notifyForm, await platformApi.getPlatformNotifySettings())
}
function toggleAlertType(type: AlertType) {
  const idx = notifyForm.alertTypes.indexOf(type)
  if (idx === -1) notifyForm.alertTypes.push(type)
  else notifyForm.alertTypes.splice(idx, 1)
}
async function saveNotify() {
  savingNotify.value = true
  try {
    Object.assign(notifyForm, await platformApi.updatePlatformNotifySettings({ ...notifyForm }))
    toast.success(t('alerts.settingsSaved'))
  } catch {
    // the API client already toasted the reason
  } finally {
    savingNotify.value = false
  }
}
async function sendTest() {
  if (!notifyForm.botToken || !notifyForm.chatId) {
    toast.error(t('alerts.enterTokenChatFirst'))
    return
  }
  testingAlert.value = true
  try {
    await platformApi.sendPlatformTestAlert(notifyForm.botToken, notifyForm.chatId)
    toast.success(t('alerts.testSent'))
  } catch {
    // the API client already toasted the reason
  } finally {
    testingAlert.value = false
  }
}

// --- Database backups -----------------------------------------------------------

const backups = ref<BackupRow[]>([])
// The server keeps only the retention window's backups, so the list comes
// whole; filtered by status and paged here.
const backupStatus = ref<'all' | BackupRow['status']>('all')
const backupStatusOptions = computed(() => [
  { value: 'all', label: t('common.allStatuses') },
  ...(['SUCCESS', 'FAILED', 'RUNNING'] as const).map((v) => ({ value: v, label: t(`backupStatus.${v}`) })),
])
const backupList = useLocalList(() => backups.value, {
  text: (b) => b.filename,
  filter: (b) => backupStatus.value === 'all' || b.status === backupStatus.value,
  deps: [backupStatus],
})
const backupSettingsForm = reactive({ autoEnabled: true, retentionDays: 14 })
const runningBackup = ref(false)
const savingBackupSettings = ref(false)

async function loadBackups() {
  const res = await platformApi.listBackups()
  backups.value = res.rows
  Object.assign(backupSettingsForm, res.settings)
}
async function saveBackupSettings() {
  savingBackupSettings.value = true
  try {
    Object.assign(backupSettingsForm, await platformApi.updateBackupSettings({ ...backupSettingsForm }))
    toast.success(t('alerts.backupSettingsSaved'))
  } catch {
    // the API client already toasted the reason
  } finally {
    savingBackupSettings.value = false
  }
}
async function backupNow() {
  runningBackup.value = true
  try {
    await platformApi.runBackupNow()
    toast.success(t('alerts.backupStarted'))
  } catch {
    // the API client already toasted the reason (e.g. the mysqldump error)
  } finally {
    runningBackup.value = false
    await loadBackups()
  }
}
async function downloadBackup(b: BackupRow) {
  try {
    await platformApi.downloadBackup(b.id, b.filename)
  } catch {
    // the API client already toasted the reason
  }
}
async function deleteBackup(id: number) {
  try {
    await platformApi.deleteBackup(id)
    toast.success(t('alerts.deleted'))
    await loadBackups()
  } catch {
    // the API client already toasted the reason
  }
}

// --- Danger zone: production reset ------------------------------------------------

const resetConfirmText = ref('')
const showResetModal = ref(false)
const resettingSystem = ref(false)
const resetConfirmReady = computed(() => resetConfirmText.value === 'RESET')

async function submitReset() {
  if (!resetConfirmReady.value) return
  resettingSystem.value = true
  try {
    await platformApi.resetForProduction(resetConfirmText.value)
    toast.success(t('platform.resetDone'))
    showResetModal.value = false
    resetConfirmText.value = ''
    await loadBackups()
  } catch {
    // the API client already toasted the reason
  } finally {
    resettingSystem.value = false
  }
}
</script>

<template>
  <div class="p-4 sm:p-8 space-y-6">
    <div>
      <h1 class="font-heading text-2xl">{{ $t('platform.systemTitle') }}</h1>
      <p class="text-sm text-muted mt-1 max-w-2xl">{{ $t('platform.systemIntro') }}</p>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
      <div class="card space-y-4">
        <h2 class="font-heading text-base">{{ $t('alerts.backupTitle') }}</h2>

        <label class="flex items-center justify-between text-sm">
          <span>{{ $t('alerts.autoBackup') }}</span>
          <button
            type="button"
            role="switch"
            :aria-checked="backupSettingsForm.autoEnabled"
            class="w-9 h-5 rounded-full transition-colors relative"
            :class="backupSettingsForm.autoEnabled ? 'bg-primary' : 'bg-line'"
            @click="backupSettingsForm.autoEnabled = !backupSettingsForm.autoEnabled"
          >
            <span class="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" :class="backupSettingsForm.autoEnabled ? 'left-4' : 'left-0.5'" />
          </button>
        </label>
        <p class="text-xs text-muted -mt-2">{{ $t('alerts.autoBackupHint') }}</p>

        <div class="flex items-end gap-3 flex-wrap">
          <div>
            <label class="block text-sm text-muted mb-1">{{ $t('alerts.retentionDays') }}</label>
            <input v-model.number="backupSettingsForm.retentionDays" type="number" min="1" max="365" class="input w-28" />
          </div>
          <button type="button" class="btn-secondary" :disabled="savingBackupSettings" @click="saveBackupSettings">{{ $t('common.save') }}</button>
          <button type="button" class="btn-primary ml-auto" :disabled="runningBackup" @click="backupNow">
            {{ runningBackup ? $t('alerts.backingUp') : $t('alerts.backupNow') }}
          </button>
        </div>

        <div class="border-t border-line pt-3 space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-sm font-medium">{{ $t('alerts.history') }}</h3>
            <SearchableSelect
              v-model="backupStatus"
              class="w-full sm:w-40"
              :options="backupStatusOptions"
              :searchable="false"
              :clearable="false"
            />
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-muted border-b border-line">
                  <th class="py-2 font-medium">{{ $t('col.date') }}</th>
                  <th class="py-2 font-medium">{{ $t('common.type') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.status') }}</th>
                  <th class="py-2 font-medium text-right">{{ $t('col.size') }}</th>
                  <th class="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="b in backupList.rows" :key="b.id" class="border-b border-line last:border-0">
                  <td class="py-2 font-mono text-xs">{{ formatDateTime(b.startedAt) }}</td>
                  <td class="py-2">{{ $t(`backupTrigger.${b.triggerType}`) }}</td>
                  <td class="py-2">
                    <StatusBadge
                      :tone="b.status === 'SUCCESS' ? 'success' : b.status === 'FAILED' ? 'danger' : 'neutral'"
                      :label="$t(`backupStatus.${b.status}`)"
                    />
                  </td>
                  <td class="py-2 text-right font-mono text-xs">{{ b.sizeBytes ? `${(b.sizeBytes / 1024 / 1024).toFixed(1)} MB` : '—' }}</td>
                  <td class="py-2 text-right">
                    <div class="flex items-center justify-end gap-1">
                      <span v-if="!b.downloadable && b.error" class="text-xs text-danger-strong mr-1" :title="b.error">{{ b.error.slice(0, 40) }}</span>
                      <button
                        v-if="b.downloadable"
                        type="button"
                        class="p-1.5 text-muted hover:text-ink"
                        :aria-label="$t('alerts.download')"
                        :title="$t('alerts.download')"
                        @click="downloadBackup(b)"
                      >
                        <Download :stroke-width="1.8" class="w-4 h-4" />
                      </button>
                      <ConfirmDelete v-if="b.status !== 'RUNNING'" :item-label="$t('entity.backup')" :item-name="b.filename" @confirm="deleteBackup(b.id)" />
                    </div>
                  </td>
                </tr>
                <tr v-if="backupList.total === 0">
                  <td colspan="5" class="py-6 text-center text-muted">{{ backups.length === 0 ? $t('alerts.noBackupsYet') : $t('common.noMatches') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <Pagination v-model:page="backupList.page" :total-pages="backupList.totalPages" :total="backupList.total" :per-page="backupList.perPage" :noun="$t('platform.backupsNoun')" />
        </div>

        <p class="text-xs text-muted border-t border-line pt-3">{{ $t('alerts.diskNote') }}</p>
      </div>

      <div class="space-y-4">
        <form class="card space-y-4" data-footer-form @submit.prevent="saveFooter">
          <div>
            <h2 class="font-heading text-base">{{ $t('platform.footerTitle') }}</h2>
            <p class="text-xs text-muted mt-1">{{ $t('platform.footerIntro') }}</p>
          </div>
          <div>
            <label for="footer-text" class="block text-sm text-muted mb-1">{{ $t('platform.footerText') }}</label>
            <input
              id="footer-text"
              v-model="footerText"
              type="text"
              maxlength="200"
              class="input"
              :placeholder="$t('platform.footerPlaceholder', { year: FOOTER_YEAR })"
              autocomplete="off"
            />
            <p class="text-xs text-muted mt-1">{{ $t('platform.footerHint', { year: FOOTER_YEAR }) }}</p>
          </div>
          <div>
            <p class="text-xs text-muted mb-1">{{ $t('platform.footerPreview') }}</p>
            <p class="rounded-control border border-line bg-page px-3 py-2 text-center text-xs" :class="footerPreview ? 'text-muted' : 'text-muted/60 italic'" data-footer-preview>
              {{ footerPreview || $t('platform.footerNone') }}
            </p>
          </div>
          <div class="flex justify-end">
            <button type="submit" class="btn-primary" :disabled="savingFooter">{{ $t('common.save') }}</button>
          </div>
        </form>

        <div class="card space-y-4">
          <div>
            <h2 class="font-heading text-base">{{ $t('alerts.telegramTitle') }}</h2>
            <p class="text-xs text-muted mt-1">{{ $t('platform.alertsIntro') }}</p>
          </div>

          <label class="flex items-center justify-between text-sm">
            <span>{{ $t('alerts.enabled') }}</span>
            <button
              type="button"
              role="switch"
              :aria-checked="notifyForm.enabled"
              class="w-9 h-5 rounded-full transition-colors relative"
              :class="notifyForm.enabled ? 'bg-primary' : 'bg-line'"
              @click="notifyForm.enabled = !notifyForm.enabled"
            >
              <span class="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" :class="notifyForm.enabled ? 'left-4' : 'left-0.5'" />
            </button>
          </label>

          <div>
            <label class="block text-sm text-muted mb-1">{{ $t('alerts.botToken') }}</label>
            <input v-model.trim="notifyForm.botToken" type="text" class="input font-mono" :placeholder="$t('alerts.botTokenPlaceholder')" autocomplete="off" />
          </div>
          <div>
            <label class="block text-sm text-muted mb-1">{{ $t('alerts.chatId') }}</label>
            <input v-model.trim="notifyForm.chatId" type="text" class="input font-mono" :placeholder="$t('alerts.chatIdPlaceholder')" autocomplete="off" />
          </div>

          <div>
            <label class="block text-sm text-muted mb-2">{{ $t('alerts.alertTypesLabel') }}</label>
            <div class="grid grid-cols-1 gap-1.5">
              <label v-for="type in PLATFORM_ALERT_TYPES" :key="type" class="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" class="rounded" :checked="notifyForm.alertTypes.includes(type)" @change="toggleAlertType(type)" />
                {{ $t(`alertType.${type}`) }}
              </label>
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <button type="button" class="btn-secondary flex items-center gap-2" :disabled="testingAlert" @click="sendTest">
              <Send :stroke-width="1.8" class="w-4 h-4" /> {{ $t('alerts.sendTest') }}
            </button>
            <button type="button" class="btn-primary" :disabled="savingNotify" @click="saveNotify">{{ $t('common.save') }}</button>
          </div>
        </div>

        <div class="card border-2 border-danger space-y-4">
          <div>
            <h2 class="font-heading text-base text-danger-strong">{{ $t('settings.dangerZoneTitle') }}</h2>
            <p class="text-xs text-muted mt-1">{{ $t('platform.resetIntro') }}</p>
          </div>
          <ul class="text-xs text-muted list-disc list-inside space-y-0.5">
            <li>{{ $t('platform.resetKeeps') }}</li>
            <li>{{ $t('platform.resetWipes') }}</li>
          </ul>
          <button type="button" class="btn-danger" @click="showResetModal = true">{{ $t('settings.dangerZoneButton') }}</button>
        </div>
      </div>
    </div>

    <Modal v-if="showResetModal" :title="$t('settings.dangerZoneTitle')" @close="showResetModal = false">
      <div class="space-y-4">
        <p class="text-sm">{{ $t('platform.resetIntro') }}</p>
        <ul class="text-xs text-muted list-disc list-inside space-y-0.5">
          <li>{{ $t('platform.resetKeeps') }}</li>
          <li>{{ $t('platform.resetWipes') }}</li>
        </ul>
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('settings.dangerZoneConfirmLabel') }}</label>
          <input v-model="resetConfirmText" type="text" class="input font-mono" placeholder="RESET" autocomplete="off" />
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="showResetModal = false">{{ $t('common.cancel') }}</button>
          <button type="button" class="btn-danger" :disabled="!resetConfirmReady || resettingSystem" @click="submitReset">
            {{ $t('settings.dangerZoneButton') }}
          </button>
        </div>
      </div>
    </Modal>
  </div>
</template>
