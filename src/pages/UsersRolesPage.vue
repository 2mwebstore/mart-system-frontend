<script setup lang="ts">
// Users & Roles per build spec §8.7, backed by /users, /roles and /permissions.
// Role permission changes reach a signed-in user's token at their next
// refresh (access tokens carry the permission list).
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { KeyRound, Plus } from 'lucide-vue-next'
import * as peopleApi from '@/api/people'
import type { Permission, Role, StaffUser } from '@/types/domain'
import { useAuthStore } from '@/stores/auth'
import { formatDateTime, initialsOf } from '@/utils/format'
import Tabs from '@/components/Tabs.vue'
import Modal from '@/components/Modal.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import ConfirmDelete from '@/components/ConfirmDelete.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import Pagination from '@/components/Pagination.vue'
import { useDebounced, usePagedList } from '@/composables/usePagedList'
import { useToast } from '@/composables/useToast'
import { label, permissionLabel, roleDescription, t } from '@/i18n'

const toast = useToast()
const auth = useAuthStore()
const canManageUsers = auth.hasPermission('user.manage')
const canManageRoles = auth.hasPermission('role.manage')

const activeTab = ref('users')
const tabs = computed(() => [
  { key: 'users', label: t('users.tabUsers') },
  { key: 'roles', label: t('users.tabRoles') },
])

const roles = ref<Role[]>([])
const permissions = ref<Permission[]>([])
const loading = ref(true)

async function loadRoles() {
  ;[roles.value, permissions.value] = await Promise.all([peopleApi.listRoles(), peopleApi.listPermissions()])
}
onMounted(async () => {
  try {
    await loadRoles()
    if (roles.value.length) selectedRoleId.value = roles.value[0].id
  } finally {
    loading.value = false
  }
})

const branches = computed(() => auth.branches)

// ---- Users tab ----------------------------------------------------------

const search = ref('')
const roleFilter = ref<'all' | number>('all')
const branchFilter = ref<'all' | number>('all')
const roleFilterOptions = computed(() => [{ value: 'all', label: t('users.allRoles') }, ...roles.value.map((r) => ({ value: r.id, label: label('role', r.name) }))])
const branchFilterOptions = computed(() => [{ value: 'all', label: t('users.allBranches') }, ...branches.value.map((b) => ({ value: b.id, label: b.name }))])
const roleOptions = computed(() => roles.value.map((r) => ({ value: r.id, label: label('role', r.name) })))

// Search and the role / branch filters run on the server; one page at a time.
const debouncedSearch = useDebounced(search)
const usersList = reactive(
  usePagedList(
    ({ page, perPage }) =>
      peopleApi.pageUsers({
        page,
        perPage,
        q: debouncedSearch.value.trim(),
        roleId: roleFilter.value === 'all' ? null : roleFilter.value,
        branchId: branchFilter.value === 'all' ? null : branchFilter.value,
      }),
    { deps: [debouncedSearch, roleFilter, branchFilter] },
  ),
)

// The right-hand panel edits an existing user (selectedUserId set) or
// creates one (creating = true).
const selectedUserId = ref<number | null>(null)
const creating = ref(false)
const saving = ref(false)
const editForm = reactive({ fullName: '', username: '', phone: '', roleId: 0, branchIds: [] as number[], active: true, password: '', pin: '' })

function openUser(u: StaffUser) {
  creating.value = false
  selectedUserId.value = u.id
  Object.assign(editForm, { fullName: u.fullName, username: u.username, phone: u.phone, roleId: u.roleId, branchIds: [...u.branchIds], active: u.active, password: '', pin: '' })
}
function newUser() {
  selectedUserId.value = null
  creating.value = true
  Object.assign(editForm, {
    fullName: '',
    username: '',
    phone: '',
    roleId: roles.value.find((r) => r.name === 'Cashier')?.id ?? roles.value[0]?.id ?? 0,
    branchIds: auth.activeBranchId ? [auth.activeBranchId] : [],
    active: true,
    password: '',
    pin: '',
  })
}
function closePanel() {
  selectedUserId.value = null
  creating.value = false
}
const panelOpen = computed(() => creating.value || selectedUserId.value !== null)

async function saveUser() {
  saving.value = true
  try {
    const body = { ...editForm, password: editForm.password || undefined, pin: editForm.pin || undefined }
    if (creating.value) {
      await peopleApi.createUser(body)
      toast.success(t('users.created'))
    } else if (selectedUserId.value !== null) {
      await peopleApi.updateUser(selectedUserId.value, body)
      toast.success(t('users.saved'))
    }
    closePanel()
    await Promise.all([usersList.reload(), loadRoles()])
  } catch {
    // the API client already toasted the reason
  } finally {
    saving.value = false
  }
}

const issuedPin = ref<{ name: string; pin: string } | null>(null)
async function resetPin() {
  const u = usersList.rows.find((x) => x.id === selectedUserId.value)
  if (!u) return
  try {
    const res = await peopleApi.resetUserPin(u.id)
    issuedPin.value = { name: u.fullName, pin: res.pin }
  } catch {
    // toasted by the API client
  }
}

// ---- Roles tab ------------------------------------------------------------

const groupLabel = (g: string) => (g === 'user' ? t('permGroup.userFull') : label('permGroup', g))
const permissionGroups = computed(() => {
  const order: string[] = []
  const byGroup = new Map<string, Permission[]>()
  for (const p of permissions.value) {
    if (!byGroup.has(p.group)) {
      byGroup.set(p.group, [])
      order.push(p.group)
    }
    byGroup.get(p.group)!.push(p)
  }
  return order.map((g) => ({ group: g, label: groupLabel(g), keys: byGroup.get(g)! }))
})

const selectedRoleId = ref(0)
const selectedRole = computed(() => roles.value.find((r) => r.id === selectedRoleId.value) ?? null)

// Edits are made on a draft so "Unsaved changes" is real and Save sends the
// whole role at once.
const draft = reactive({ permissions: [] as string[], maxDiscountPercent: 0, refundWithoutApprovalCents: 0 })
let savedSnapshot = ''
function snapshot() {
  return JSON.stringify({ p: [...draft.permissions].sort(), d: draft.maxDiscountPercent, r: draft.refundWithoutApprovalCents })
}
watch(
  selectedRole,
  (role) => {
    if (!role) return
    Object.assign(draft, { permissions: [...role.permissions], maxDiscountPercent: role.maxDiscountPercent, refundWithoutApprovalCents: role.refundWithoutApprovalCents })
    savedSnapshot = snapshot()
  },
  { immediate: true },
)
const hasUnsavedChanges = computed(() => selectedRole.value !== null && snapshot() !== savedSnapshot)

function isGranted(key: string) {
  return draft.permissions.includes(key)
}
function togglePermission(key: string) {
  if (!selectedRole.value || selectedRole.value.isLocked || !canManageRoles) return
  const idx = draft.permissions.indexOf(key)
  if (idx === -1) draft.permissions.push(key)
  else draft.permissions.splice(idx, 1)
}

async function saveRole() {
  const role = selectedRole.value
  if (!role) return
  try {
    await peopleApi.updateRole(role.id, {
      name: role.name,
      description: role.description,
      permissions: draft.permissions,
      maxDiscountPercent: Number(draft.maxDiscountPercent) || 0,
      refundWithoutApprovalCents: Math.round(Number(draft.refundWithoutApprovalCents) || 0),
    })
    toast.success(t('users.roleSaved', { name: label('role', role.name) }))
    await loadRoles()
  } catch {
    // toasted by the API client
  }
}

async function duplicateRole() {
  const role = selectedRole.value
  if (!role) return
  try {
    const created = await peopleApi.createRole({
      name: t('users.roleCopy', { name: label('role', role.name) }),
      description: role.description,
      permissions: [...role.permissions],
      maxDiscountPercent: role.maxDiscountPercent,
      refundWithoutApprovalCents: role.refundWithoutApprovalCents,
    })
    await loadRoles()
    selectedRoleId.value = created.id
    toast.success(t('users.roleDuplicated', { name: created.name }))
  } catch {
    // toasted by the API client
  }
}

async function deleteRole() {
  const role = selectedRole.value
  if (!role) return
  try {
    await peopleApi.deleteRole(role.id)
    toast.success(t('users.roleDeleted', { name: label('role', role.name) }))
    await loadRoles()
    selectedRoleId.value = roles.value[0]?.id ?? 0
  } catch {
    // toasted by the API client
  }
}
</script>

<template>
  <div class="p-8 space-y-6">
    <h1 class="font-heading text-2xl">{{ $t('users.title') }}</h1>

    <Tabs v-model="activeTab" :tabs="tabs" />

    <!-- Users tab -->
    <div v-if="activeTab === 'users'" class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="card lg:col-span-2 space-y-4">
        <div class="flex flex-wrap gap-3 items-center">
          <input v-model="search" type="search" :placeholder="$t('users.searchPlaceholder')" class="input max-w-xs" />
          <SearchableSelect v-model="roleFilter" class="w-44" :options="roleFilterOptions" :clearable="false" />
          <SearchableSelect v-model="branchFilter" class="w-44" :options="branchFilterOptions" :clearable="false" />
          <button v-if="canManageUsers" type="button" class="btn-primary flex items-center gap-2 ml-auto" @click="newUser">
            <Plus :stroke-width="1.8" class="w-4 h-4" /> {{ $t('users.new') }}
          </button>
        </div>

        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted border-b border-line">
              <th class="py-2 font-medium">{{ $t('col.name') }}</th>
              <th class="py-2 font-medium">{{ $t('col.role') }}</th>
              <th class="py-2 font-medium">{{ $t('col.branches') }}</th>
              <th class="py-2 font-medium">{{ $t('col.status') }}</th>
              <th class="py-2 font-medium">{{ $t('col.lastActive') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="s in usersList.rows"
              :key="s.id"
              class="border-b border-line last:border-0 hover:bg-surface-subtle"
              :class="[selectedUserId === s.id ? 'bg-primary-tint-row' : '', canManageUsers ? 'cursor-pointer' : '']"
              @click="canManageUsers && openUser(s)"
            >
              <td class="py-2">
                <div class="flex items-center gap-2">
                  <span class="w-7 h-7 rounded-full bg-primary-tint text-primary-tint-text text-xs flex items-center justify-center font-medium shrink-0">
                    {{ initialsOf(s.fullName) }}
                  </span>
                  <div>
                    <p class="leading-tight">{{ s.fullName }}</p>
                    <p class="text-xs text-muted leading-tight">@{{ s.username }}</p>
                  </div>
                </div>
              </td>
              <td class="py-2">{{ label('role', s.roleName) }}</td>
              <td class="py-2 text-muted">{{ s.branchIds.map((id) => branches.find((b) => b.id === id)?.code).filter(Boolean).join(', ') || '—' }}</td>
              <td class="py-2"><StatusBadge :tone="s.active ? 'success' : 'neutral'" :label="s.active ? $t('common.active') : $t('common.disabled')" /></td>
              <td class="py-2 font-mono text-xs text-muted">{{ formatDateTime(s.lastActiveAt) }}</td>
            </tr>
            <tr v-if="!usersList.loading && usersList.rows.length === 0">
              <td colspan="5" class="py-6 text-center text-muted">{{ $t('users.none') }}</td>
            </tr>
          </tbody>
        </table>
        <Pagination v-model:page="usersList.page" :total-pages="usersList.totalPages" :total="usersList.total" :per-page="usersList.perPage" :noun="$t('users.noun')" />
      </div>

      <div v-if="panelOpen" class="card space-y-4 h-fit">
        <h2 class="font-heading text-base">{{ creating ? $t('users.new') : $t('users.edit') }}</h2>
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('users.fullName') }}</label>
          <input v-model="editForm.fullName" type="text" class="input" />
        </div>
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('users.username') }}</label>
          <input v-model="editForm.username" type="text" class="input" />
        </div>
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('common.phone') }}</label>
          <input v-model="editForm.phone" type="text" class="input" placeholder="012 345 678" />
        </div>
        <div>
          <SearchableSelect v-model="editForm.roleId" :label="$t('common.role')" :options="roleOptions" :clearable="false" />
          <button
            type="button"
            class="text-xs text-primary-text hover:underline mt-1"
            @click="activeTab = 'roles'; selectedRoleId = editForm.roleId"
          >
            {{ $t('users.viewRole') }}
          </button>
        </div>
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('users.branchAccess') }}</label>
          <div class="space-y-1">
            <label v-for="b in branches" :key="b.id" class="flex items-center gap-2 text-sm">
              <input v-model="editForm.branchIds" type="checkbox" :value="b.id" class="rounded" />
              {{ b.name }}
            </label>
          </div>
        </div>
        <div>
          <label class="block text-sm text-muted mb-1">{{ creating ? $t('users.password') : $t('users.newPassword') }}</label>
          <input v-model="editForm.password" type="password" class="input" autocomplete="new-password" :placeholder="$t('users.passwordHint')" />
        </div>
        <div v-if="creating">
          <label class="block text-sm text-muted mb-1">{{ $t('users.pinLabel') }}</label>
          <input v-model="editForm.pin" type="text" inputmode="numeric" maxlength="4" class="input font-mono" />
        </div>
        <button v-else type="button" class="btn-secondary w-full flex items-center justify-center gap-2" @click="resetPin">
          <KeyRound :stroke-width="1.8" class="w-4 h-4" /> {{ $t('users.resetPin') }}
        </button>
        <label class="flex items-center justify-between text-sm">
          <span>{{ $t('users.accountActive') }}</span>
          <input v-model="editForm.active" type="checkbox" class="rounded" />
        </label>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="closePanel">{{ $t('users.discard') }}</button>
          <button type="button" class="btn-primary" :disabled="saving" @click="saveUser">{{ creating ? $t('users.create') : $t('common.save') }}</button>
        </div>
      </div>
      <div v-else class="card h-fit text-sm text-muted">
        {{ canManageUsers ? $t('users.selectHint') : $t('users.viewOnly') }}
      </div>
    </div>

    <!-- Roles tab -->
    <div v-else-if="selectedRole" class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="card space-y-1 h-fit">
        <button
          v-for="r in roles"
          :key="r.id"
          type="button"
          class="w-full text-left px-3 py-2 rounded-control transition"
          :class="selectedRoleId === r.id ? 'bg-primary-tint text-primary-tint-text' : 'hover:bg-surface-subtle'"
          @click="selectedRoleId = r.id"
        >
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium">{{ label('role', r.name) }}</span>
            <span class="text-xs text-muted">{{ $t('users.usersCount', { n: r.userCount }) }}</span>
          </div>
          <p class="text-xs text-muted mt-0.5">{{ roleDescription(r.name, r.description) }}</p>
        </button>
      </div>

      <div class="lg:col-span-2 card space-y-5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <h2 class="font-heading text-lg">{{ label('role', selectedRole.name) }}</h2>
            <StatusBadge v-if="selectedRole.isLocked" :label="$t('users.readOnly')" tone="neutral" />
            <StatusBadge v-else-if="hasUnsavedChanges" :label="$t('users.unsaved')" tone="warning" />
          </div>
          <div v-if="canManageRoles" class="flex gap-2">
            <button type="button" class="btn-secondary flex items-center gap-2" @click="duplicateRole">
              <Plus :stroke-width="1.8" class="w-4 h-4" /> {{ $t('users.duplicate') }}
            </button>
            <ConfirmDelete v-if="!selectedRole.isLocked && selectedRole.userCount === 0" :item-label="$t('entity.role')" :item-name="label('role', selectedRole.name)" size="md" @confirm="deleteRole" />
            <button type="button" class="btn-primary" :disabled="selectedRole.isLocked || !hasUnsavedChanges" @click="saveRole">{{ $t('users.saveRole') }}</button>
          </div>
        </div>

        <div v-for="group in permissionGroups" :key="group.group" class="space-y-2">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-medium">{{ group.label }}</h3>
            <span class="text-xs text-muted">
              {{ $t('users.ofCount', { granted: group.keys.filter((k) => isGranted(k.key)).length, total: group.keys.length }) }}
            </span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            <label
              v-for="k in group.keys"
              :key="k.key"
              class="flex items-center gap-2 text-sm"
              :class="selectedRole.isLocked || !canManageRoles ? 'opacity-60' : 'cursor-pointer'"
            >
              <input
                type="checkbox"
                class="rounded"
                :checked="isGranted(k.key)"
                :disabled="selectedRole.isLocked || !canManageRoles"
                @change="togglePermission(k.key)"
              />
              {{ permissionLabel(k.key, k.description) }}
            </label>
          </div>
        </div>

        <div class="card bg-surface-subtle">
          <h3 class="text-sm font-medium mb-3">{{ $t('users.limits') }}</h3>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs text-muted mb-1">{{ $t('users.maxDiscount') }}</label>
              <input v-model.number="draft.maxDiscountPercent" type="number" min="0" max="100" class="input" :disabled="selectedRole.isLocked || !canManageRoles" />
            </div>
            <div>
              <label class="block text-xs text-muted mb-1">{{ $t('users.refundLimit') }}</label>
              <input
                :value="(draft.refundWithoutApprovalCents / 100).toFixed(2)"
                type="number"
                min="0"
                step="0.01"
                class="input"
                :disabled="selectedRole.isLocked || !canManageRoles"
                @input="draft.refundWithoutApprovalCents = Math.round(Number(($event.target as HTMLInputElement).value) * 100)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="card text-sm text-muted">{{ $t('users.noRoles') }}</div>

    <Modal v-if="issuedPin" :title="$t('users.newPinTitle')" @close="issuedPin = null">
      <div class="space-y-4 text-center">
        <p class="text-sm text-muted">
          {{ $t('users.newPinBody', { name: issuedPin.name }) }}
        </p>
        <p class="font-mono text-4xl tracking-[0.4em]">{{ issuedPin.pin }}</p>
        <button type="button" class="btn-primary" @click="issuedPin = null">{{ $t('common.done') }}</button>
      </div>
    </Modal>
  </div>
</template>
