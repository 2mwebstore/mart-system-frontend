<script setup lang="ts">
// Users & Roles per build spec §8.7, backed by /users, /roles and /permissions.
// It shows the active branch (picked at the top of the page): the people who
// work there, the role each holds there, and the roles that can be held there
// (shared ones and the branch's own). The server reads the role and its
// permissions on every request, so a change applies at once.
//
// The Users list takes the whole width; a new user and a user's details are
// pages of their own (pages/UserEditPage.vue), and each row has its actions.
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Eye, KeyRound, Pencil, Plus } from 'lucide-vue-next'
import * as peopleApi from '@/api/people'
import type { Permission, Role, StaffUser } from '@/types/domain'
import { useAuthStore } from '@/stores/auth'
import { formatDateTime, initialsOf } from '@/utils/format'
import Modal from '@/components/Modal.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import ConfirmDelete from '@/components/ConfirmDelete.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import Pagination from '@/components/Pagination.vue'
import PermissionPanel from '@/components/PermissionPanel.vue'
import SearchInput from '@/components/SearchInput.vue'
import ResetPinDialog from '@/components/users/ResetPinDialog.vue'
import { useDebounced, usePagedList } from '@/composables/usePagedList'
import { useLocalList } from '@/composables/useLocalList'
import { useToast } from '@/composables/useToast'
import { useRouteSection } from '@/composables/useRouteSection'
import { canOpen } from '@/utils/pageAccess'
import { label, roleDescription, t } from '@/i18n'

const toast = useToast()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
// The role held at the active branch decides these, so they follow it.
// Users and roles each have their own create / edit / delete permissions.
const canCreateUser = computed(() => auth.hasPermission('user.create'))
const canEditUser = computed(() => auth.hasPermission('user.update'))
const canDeleteUser = computed(() => auth.hasPermission('user.delete'))
const canCreateRole = computed(() => auth.hasPermission('role.create'))
const canEditRole = computed(() => auth.hasPermission('role.update'))
const canDeleteRole = computed(() => auth.hasPermission('role.delete'))
const isOwner = computed(() => auth.user?.role_name === 'Owner')
const selfId = auth.user?.id ?? null
const activeBranchId = computed(() => auth.activeBranchId)
const activeBranchName = computed(() => auth.activeBranch?.name ?? '')

// Users (/users) and Roles (/roles) are pages of their own, drawn by this one
// component; "View role" on a user moves to Roles with that role picked.
// Each is offered only to those who can open it (the sidebar lists the same).
const sections = computed(() =>
  [
    { key: 'users', route: 'users', label: t('users.tabUsers') },
    { key: 'roles', route: 'roles', label: t('users.tabRoles') },
  ].filter((s) => canOpen(s.route, auth.hasPermission)),
)
const section = useRouteSection(() => sections.value.map((s) => s.key))
const pageTitle = computed(() => sections.value.find((s) => s.key === section.value)?.label ?? t('users.title'))

// roles: those that can be held at the active branch, with how many hold each
// there. allRoles: every role the viewer can see, for the role at each of a
// user's branches.
const roles = ref<Role[]>([])
const allRoles = ref<Role[]>([])
const permissions = ref<Permission[]>([])
const loading = ref(true)

async function loadRoles() {
  ;[roles.value, allRoles.value, permissions.value] = await Promise.all([
    peopleApi.listRoles(activeBranchId.value),
    peopleApi.listRoles(),
    peopleApi.listPermissions(),
  ])
  if (!roles.value.some((r) => r.id === selectedRoleId.value)) selectedRoleId.value = roles.value[0]?.id ?? 0
}
onMounted(async () => {
  try {
    await loadRoles()
  } finally {
    loading.value = false
  }
})
watch(activeBranchId, () => void loadRoles())

const branches = computed(() => auth.branches)
const branchCode = (id: number | null) => branches.value.find((b) => b.id === id)?.code ?? ''

const roleOption = (r: Role) => ({ value: r.id, label: label('role', r.name), sub: r.branchId === null ? undefined : branchCode(r.branchId) })

// ---- Users page ---------------------------------------------------------

const search = ref('')
const roleFilter = ref<'all' | number>('all')
const roleFilterOptions = computed(() => [{ value: 'all', label: t('users.allRoles') }, ...roles.value.map(roleOption)])
watch(activeBranchId, () => (roleFilter.value = 'all'))
const statusFilter = ref<'all' | 'active' | 'disabled'>('all')
const statusFilterOptions = computed(() => [
  { value: 'all', label: t('common.allStatuses') },
  { value: 'active', label: t('common.active') },
  { value: 'disabled', label: t('common.disabled') },
])

// Search and the role filter run on the server, for the active branch; one
// page at a time. The role filter matches the role held at that branch.
const debouncedSearch = useDebounced(search)
const usersList = reactive(
  usePagedList(
    ({ page, perPage }) =>
      peopleApi.pageUsers({
        page,
        perPage,
        q: debouncedSearch.value.trim(),
        roleId: roleFilter.value === 'all' ? null : roleFilter.value,
        active: statusFilter.value === 'all' ? null : statusFilter.value === 'active',
        branchId: activeBranchId.value,
      }),
    { deps: [debouncedSearch, roleFilter, statusFilter, activeBranchId] },
  ),
)

// The role someone holds at the active branch.
function roleHere(u: StaffUser) {
  return u.branchRoles.find((r) => r.branchId === activeBranchId.value)?.roleName ?? u.roleName
}

// Someone who also works at branches the viewer doesn't manage: the server
// won't let the viewer change them, so their page only shows them and their
// row offers View, not Edit, Reset PIN or Delete.
const readOnlyRow = (u: StaffUser) => u.hasOtherBranches || !canEditUser.value
const canDeleteRow = (u: StaffUser) => canDeleteUser.value && !u.hasOtherBranches && u.id !== selfId

function openUser(u: StaffUser) {
  router.push({ name: 'user-edit', params: { id: u.id } })
}

async function deleteUser(u: StaffUser) {
  try {
    await peopleApi.deleteUser(u.id)
    toast.success(t('users.deleted'))
    await Promise.all([usersList.reload(), loadRoles()])
  } catch {
    // the API client already toasted the reason (e.g. USER_IN_USE)
  }
}

// Reset PIN asks first, then shows the new PIN (ResetPinDialog).
const pinFor = ref<StaffUser | null>(null)

// ---- Roles page -----------------------------------------------------------

// As in the income app, the panel offers only what this person may give: an
// Owner everything, anyone else the permissions they hold themselves (the
// server refuses the rest).
const holds = (key: string) => isOwner.value || auth.hasPermission(key)
const grantablePermissions = computed(() => permissions.value.filter((p) => holds(p.key)))

// A user's page opens a role here with ?role=<id>.
const selectedRoleId = ref(Number(route.query.role) || 0)
const selectedRole = computed(() => roles.value.find((r) => r.id === selectedRoleId.value) ?? null)
// The role picker: searched (shown name, stored name, description) and paged
// in the browser; the editor on the right keeps the selected role either way.
const roleList = useLocalList(() => roles.value, {
  text: (r) => [label('role', r.name), r.name, roleDescription(r.name, r.description)].join(' '),
  perPage: 8,
})
// A shared role is the Owner's to change; a branch's own role is for whoever
// manages roles there.
const sharedForThem = computed(() => !!selectedRole.value && selectedRole.value.branchId === null && !isOwner.value)
// A role with permissions this person doesn't have is above theirs: saving it
// would hand those on, which the server refuses.
const aboveThem = computed(() => !!selectedRole.value && selectedRole.value.permissions.some((k) => !holds(k)))
// Locked, shared (for a non-Owner) or above theirs: neither edited nor deleted.
const roleProtected = computed(() => !selectedRole.value || selectedRole.value.isLocked || sharedForThem.value || aboveThem.value)
const roleReadOnly = computed(() => roleProtected.value || !canEditRole.value)

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

const showNewRoleModal = ref(false)
// shared: an Owner's choice; anyone else makes roles for the active branch.
const newRoleForm = reactive({ name: '', description: '', shared: false })
function openNewRole() {
  Object.assign(newRoleForm, { name: '', description: '', shared: false })
  showNewRoleModal.value = true
}
async function createNewRole() {
  if (!newRoleForm.name.trim()) return
  try {
    const created = await peopleApi.createRole({
      name: newRoleForm.name.trim(),
      description: newRoleForm.description.trim(),
      branchId: isOwner.value && newRoleForm.shared ? null : activeBranchId.value,
      permissions: [],
      maxDiscountPercent: 0,
      refundWithoutApprovalCents: 0,
    })
    await loadRoles()
    selectedRoleId.value = created.id
    showNewRoleModal.value = false
    toast.success(t('users.roleCreated', { name: created.name }))
  } catch {
    // toasted by the API client (e.g. a duplicate name)
  }
}

async function duplicateRole() {
  const role = selectedRole.value
  if (!role) return
  try {
    const created = await peopleApi.createRole({
      name: t('users.roleCopy', { name: label('role', role.name) }),
      description: role.description,
      // An Owner's copy is shared like the original, or at its branch; anyone
      // else's belongs to the active branch.
      branchId: isOwner.value ? role.branchId : activeBranchId.value,
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
  <div class="p-4 sm:p-8 space-y-6">
    <div>
      <h1 class="font-heading text-2xl">{{ pageTitle }}</h1>
      <p v-if="activeBranchName" class="text-muted text-sm">{{ $t('users.showingBranch', { branch: activeBranchName }) }}</p>
    </div>

    <!-- Users page -->
    <div v-if="section === 'users'" class="card space-y-4">
      <div class="list-toolbar">
        <div class="list-filters">
          <SearchInput v-model="search" :placeholder="$t('users.searchPlaceholder')" />
          <SearchableSelect v-model="roleFilter" class="w-full sm:w-44" :options="roleFilterOptions" :clearable="false" />
          <SearchableSelect v-model="statusFilter" class="w-full sm:w-40" :options="statusFilterOptions" :searchable="false" :clearable="false" />
        </div>
        <RouterLink v-if="canCreateUser" :to="{ name: 'user-new' }" class="btn-primary flex items-center justify-center gap-2">
          <Plus :stroke-width="1.8" class="w-4 h-4" /> {{ $t('users.new') }}
        </RouterLink>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted border-b border-line">
              <th class="py-2 font-medium">{{ $t('col.id') }}</th>
              <th class="py-2 font-medium">{{ $t('col.name') }}</th>
              <th class="py-2 font-medium">{{ $t('common.phone') }}</th>
              <th class="py-2 font-medium">{{ $t('col.role') }}</th>
              <th class="py-2 font-medium">{{ $t('col.branches') }}</th>
              <th class="py-2 font-medium">{{ $t('col.status') }}</th>
              <th class="py-2 font-medium">{{ $t('col.lastActive') }}</th>
              <th class="py-2 font-medium text-right">{{ $t('users.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="s in usersList.rows"
              :key="s.id"
              class="border-b border-line last:border-0 hover:bg-surface-subtle cursor-pointer"
              :data-user-row="s.id"
              @click="openUser(s)"
            >
              <td class="py-2 font-mono text-xs text-muted">#{{ s.id }}</td>
              <td class="py-2">
                <div class="flex items-center gap-2">
                  <span class="w-7 h-7 rounded-full bg-primary-tint text-primary-tint-text text-xs flex items-center justify-center font-medium shrink-0">
                    {{ initialsOf(s.fullName) }}
                  </span>
                  <div>
                    <p class="leading-tight">
                      {{ s.fullName }}
                      <span v-if="s.id === selfId" class="text-xs text-muted">({{ $t('users.you') }})</span>
                    </p>
                    <p class="text-xs text-muted leading-tight">@{{ s.username }}</p>
                  </div>
                </div>
              </td>
              <td class="py-2 font-mono text-xs text-muted">{{ s.phone || '—' }}</td>
              <td class="py-2">{{ label('role', roleHere(s)) }}</td>
              <td class="py-2 text-muted">
                {{ s.branchIds.map((id) => branches.find((b) => b.id === id)?.code).filter(Boolean).join(', ') || '—' }}
                <span v-if="s.hasOtherBranches" class="text-xs">{{ $t('users.moreBranches') }}</span>
              </td>
              <td class="py-2"><StatusBadge :tone="s.active ? 'success' : 'neutral'" :label="s.active ? $t('common.active') : $t('common.disabled')" /></td>
              <td class="py-2 font-mono text-xs text-muted">{{ formatDateTime(s.lastActiveAt) }}</td>
              <td class="py-2" @click.stop>
                <div class="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    class="btn-secondary p-2 flex items-center justify-center"
                    data-action="open"
                    :aria-label="readOnlyRow(s) ? $t('users.viewAria', { name: s.fullName }) : $t('users.editAria', { name: s.fullName })"
                    :title="readOnlyRow(s) ? $t('users.view') : $t('users.edit')"
                    @click="openUser(s)"
                  >
                    <Eye v-if="readOnlyRow(s)" class="w-4 h-4" />
                    <Pencil v-else class="w-4 h-4" />
                  </button>
                  <button
                    v-if="!readOnlyRow(s)"
                    type="button"
                    class="btn-secondary p-2 flex items-center justify-center"
                    data-action="reset-pin"
                    :aria-label="$t('users.resetPinAria', { name: s.fullName })"
                    :title="$t('users.resetPin')"
                    @click="pinFor = s"
                  >
                    <KeyRound class="w-4 h-4" />
                  </button>
                  <ConfirmDelete v-if="canDeleteRow(s)" :item-label="$t('entity.user')" :item-name="s.fullName" size="md" @confirm="deleteUser(s)" />
                </div>
              </td>
            </tr>
            <tr v-if="!usersList.loading && usersList.rows.length === 0">
              <td colspan="8" class="py-6 text-center text-muted">{{ $t('users.none') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <Pagination v-model:page="usersList.page" :total-pages="usersList.totalPages" :total="usersList.total" :per-page="usersList.perPage" :noun="$t('users.noun')" />
    </div>

    <!-- Roles page -->
    <div v-else-if="selectedRole" class="grid grid-cols-1 gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <div class="space-y-3 h-fit">
        <button v-if="canCreateRole" type="button" class="btn-primary w-full flex items-center justify-center gap-2" @click="openNewRole">
          <Plus :stroke-width="1.8" class="w-4 h-4" /> {{ $t('users.newRole') }}
        </button>
        <div class="card space-y-1">
          <SearchInput v-model="roleList.search" :placeholder="$t('users.searchRolesPlaceholder')" class="mb-2 sm:w-full" />
          <p v-if="roleList.total === 0" class="px-3 py-4 text-center text-sm text-muted">{{ $t('common.noMatches') }}</p>
          <button
            v-for="r in roleList.rows"
            :key="r.id"
            type="button"
            class="w-full text-left px-3 py-2 rounded-control transition"
            :class="selectedRoleId === r.id ? 'bg-primary-tint text-primary-tint-text' : 'hover:bg-surface-subtle'"
            @click="selectedRoleId = r.id"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm font-medium min-w-0 truncate">{{ label('role', r.name) }}</span>
              <span class="text-xs text-muted shrink-0">{{ $t('users.usersCount', { n: r.userCount }) }}</span>
            </div>
            <span class="text-[11px] uppercase tracking-wide text-muted">{{ r.branchId === null ? $t('users.shared') : branchCode(r.branchId) }}</span>
            <p class="text-xs text-muted mt-0.5">{{ roleDescription(r.name, r.description) }}</p>
          </button>
          <Pagination v-model:page="roleList.page" :total-pages="roleList.totalPages" :total="roleList.total" :per-page="roleList.perPage" :noun="$t('users.rolesNoun')" />
        </div>
      </div>

      <div class="card min-w-0 space-y-5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="font-heading text-lg">{{ label('role', selectedRole.name) }}</h2>
            <span class="font-mono text-xs text-muted">#{{ selectedRole.id }}</span>
            <StatusBadge :label="selectedRole.branchId === null ? $t('users.shared') : branchCode(selectedRole.branchId)" tone="neutral" />
            <StatusBadge v-if="selectedRole.isLocked || sharedForThem || aboveThem" :label="$t('users.readOnly')" tone="neutral" />
            <StatusBadge v-else-if="hasUnsavedChanges" :label="$t('users.unsaved')" tone="warning" />
          </div>
          <div v-if="canCreateRole || canEditRole || canDeleteRole" class="flex flex-wrap gap-2">
            <button v-if="canCreateRole" type="button" class="btn-secondary flex items-center gap-2" @click="duplicateRole">
              <Plus :stroke-width="1.8" class="w-4 h-4" /> {{ $t('users.duplicate') }}
            </button>
            <ConfirmDelete v-if="canDeleteRole && !roleProtected && selectedRole.userCount === 0" :item-label="$t('entity.role')" :item-name="label('role', selectedRole.name)" size="md" @confirm="deleteRole" />
            <button v-if="canEditRole" type="button" class="btn-primary" :disabled="roleReadOnly || !hasUnsavedChanges" @click="saveRole">{{ $t('users.saveRole') }}</button>
          </div>
        </div>
        <p v-if="sharedForThem && canEditRole" class="text-sm text-muted">{{ $t('users.sharedRoleHint') }}</p>
        <p v-else-if="aboveThem && canEditRole && !selectedRole.isLocked" class="text-sm text-muted">{{ $t('users.permAboveYours') }}</p>

        <div class="card bg-surface-subtle">
          <h3 class="text-sm font-medium mb-3">{{ $t('users.limits') }}</h3>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label class="block text-xs text-muted mb-1">{{ $t('users.maxDiscount') }}</label>
              <input v-model.number="draft.maxDiscountPercent" type="number" min="0" max="100" class="input" :disabled="roleReadOnly" />
            </div>
            <div>
              <label class="block text-xs text-muted mb-1">{{ $t('users.refundLimit') }}</label>
              <input
                :value="(draft.refundWithoutApprovalCents / 100).toFixed(2)"
                type="number"
                min="0"
                step="0.01"
                class="input"
                :disabled="roleReadOnly"
                @input="draft.refundWithoutApprovalCents = Math.round(Number(($event.target as HTMLInputElement).value) * 100)"
              />
            </div>
          </div>
        </div>

        <div class="space-y-3">
          <div>
            <h3 class="font-heading text-base">{{ $t('users.permissionsTitle') }}</h3>
            <p class="text-xs text-muted">
              {{ $t('users.permHint') }}<template v-if="!isOwner"> {{ $t('users.permOwnOnly') }}</template>
            </p>
          </div>
          <PermissionPanel v-model="draft.permissions" :permissions="aboveThem ? permissions : grantablePermissions" :disabled="roleReadOnly" />
        </div>
      </div>
    </div>
    <div v-else class="card text-sm text-muted">{{ $t('users.noRoles') }}</div>

    <ResetPinDialog v-if="pinFor" :user-id="pinFor.id" :name="pinFor.fullName" @close="pinFor = null" />

    <Modal v-if="showNewRoleModal" :title="$t('users.newRole')" @close="showNewRoleModal = false">
      <form class="space-y-4" @submit.prevent="createNewRole">
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('users.newRoleName') }}</label>
          <input v-model="newRoleForm.name" type="text" class="input" required autofocus />
        </div>
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('users.newRoleDescription') }}</label>
          <input v-model="newRoleForm.description" type="text" class="input" />
        </div>
        <div v-if="isOwner" class="space-y-1">
          <p class="text-sm text-muted">{{ $t('users.roleFor') }}</p>
          <label class="flex items-center gap-2 text-sm">
            <input v-model="newRoleForm.shared" type="radio" :value="false" />
            {{ $t('users.roleForBranch', { branch: activeBranchName }) }}
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input v-model="newRoleForm.shared" type="radio" :value="true" />
            {{ $t('users.roleForAll') }}
          </label>
        </div>
        <p v-else class="text-xs text-muted">{{ $t('users.newRoleAtBranch', { branch: activeBranchName }) }}</p>
        <p class="text-xs text-muted">{{ $t('users.newRoleHint') }}</p>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="showNewRoleModal = false">{{ $t('common.cancel') }}</button>
          <button type="submit" class="btn-primary">{{ $t('settings.create') }}</button>
        </div>
      </form>
    </Modal>
  </div>
</template>
