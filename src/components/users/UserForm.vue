<script setup lang="ts">
// A user's account and access, for the new-user and edit-user pages
// (pages/UserEditPage.vue). Account: name, username, phone, password, the POS
// PIN on create, active. Access: the main role, the branches, and a different
// role at some of them. The server checks every rule again (a role only held at
// its own branch, nothing above the viewer's own); this offers only what fits.
import { computed, reactive, watch } from 'vue'
import type { UserInput } from '@/api/people'
import type { Role, StaffUser } from '@/types/domain'
import { useAuthStore } from '@/stores/auth'
import { label, t } from '@/i18n'
import SearchableSelect from '@/components/SearchableSelect.vue'
import MultiSearchableSelect from '@/components/MultiSearchableSelect.vue'
import PasswordInput from '@/components/PasswordInput.vue'

const props = defineProps<{
  // null: a new user.
  user: StaffUser | null
  // Every role the viewer can see.
  roles: Role[]
  // The role a new user starts with.
  defaultRoleId: number
  // Roles whose permissions "View role" can open (those of the active branch).
  viewableRoleIds: number[]
  readOnly: boolean
  saving: boolean
}>()
const emit = defineEmits<{ save: [UserInput]; cancel: []; viewRole: [number] }>()

const auth = useAuthStore()
const creating = computed(() => props.user === null)
const branches = computed(() => auth.branches)
const branchAccessOptions = computed(() => branches.value.map((b) => ({ value: b.id, label: b.name, sub: b.code })))
const branchCode = (id: number | null) => branches.value.find((b) => b.id === id)?.code ?? ''

// branchRoles: the role at a branch, where it isn't the main role.
const form = reactive({
  fullName: '',
  username: '',
  phone: '',
  roleId: 0,
  branchIds: [] as number[],
  branchRoles: {} as Record<number, number>,
  active: true,
  password: '',
  pin: '',
})
watch(
  () => [props.user, props.defaultRoleId] as const,
  ([u, defaultRole]) => {
    Object.assign(
      form,
      u
        ? {
            fullName: u.fullName,
            username: u.username,
            phone: u.phone,
            roleId: u.roleId,
            branchIds: [...u.branchIds],
            branchRoles: Object.fromEntries(u.branchRoles.map((r) => [r.branchId, r.roleId])),
            active: u.active,
          }
        : {
            fullName: '',
            username: '',
            phone: '',
            roleId: defaultRole,
            branchIds: auth.activeBranchId ? [auth.activeBranchId] : [],
            branchRoles: {},
            active: true,
          },
      { password: '', pin: '' },
    )
  },
  { immediate: true },
)

// A branch's own role can only be held at that branch.
const rolesAt = (branchId: number) => props.roles.filter((r) => r.branchId === null || r.branchId === branchId)
const roleOption = (r: Role) => ({ value: r.id, label: label('role', r.name), sub: r.branchId === null ? undefined : branchCode(r.branchId) })

// The main role: a shared one, or one of their branches' own (the server checks
// it's only held at that branch).
const mainRoleOptions = computed(() =>
  props.roles.filter((r) => r.branchId === null || form.branchIds.includes(r.branchId) || r.id === form.roleId).map(roleOption),
)
// The Owner role covers every branch, so it's never offered per branch, and an
// Owner has no per-branch roles.
const mainIsOwner = computed(() => props.roles.find((r) => r.id === form.roleId)?.name === 'Owner')
const branchRoleRows = computed(() =>
  form.branchIds.length > 1 && !mainIsOwner.value
    ? form.branchIds.map((id) => ({
        id,
        name: branches.value.find((b) => b.id === id)?.name ?? `#${id}`,
        options: [
          { value: 0, label: t('users.mainRole') },
          ...rolesAt(id)
            .filter((r) => r.id !== form.roleId && r.name !== 'Owner')
            .map(roleOption),
        ],
      }))
    : [],
)
function setBranchRole(branchId: number, roleId: number | string | null) {
  const id = Number(roleId) || 0
  if (id === 0 || id === form.roleId) delete form.branchRoles[branchId]
  else form.branchRoles[branchId] = id
}

function submit() {
  if (props.readOnly) return
  const branchRoles = Object.entries(form.branchRoles)
    .map(([branchId, roleId]) => ({ branchId: Number(branchId), roleId }))
    .filter((r) => branchRoleRows.value.some((row) => row.id === r.branchId) && r.roleId !== form.roleId)
  emit('save', {
    fullName: form.fullName,
    username: form.username,
    phone: form.phone,
    roleId: form.roleId,
    branchIds: [...form.branchIds],
    branchRoles,
    active: form.active,
    password: form.password || undefined,
    pin: creating.value ? form.pin || undefined : undefined,
  })
}
</script>

<template>
  <form class="space-y-6" @submit.prevent="submit">
    <fieldset :disabled="readOnly" class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section class="space-y-4">
        <h2 class="font-heading text-base">{{ $t('users.accountSection') }}</h2>
        <div>
          <label for="user-full-name" class="block text-sm text-muted mb-1">{{ $t('users.fullName') }}</label>
          <input id="user-full-name" v-model="form.fullName" type="text" class="input" required />
        </div>
        <div>
          <label for="user-username" class="block text-sm text-muted mb-1">{{ $t('users.username') }}</label>
          <input id="user-username" v-model="form.username" type="text" class="input" autocomplete="off" required />
        </div>
        <div>
          <label for="user-phone" class="block text-sm text-muted mb-1">{{ $t('common.phone') }}</label>
          <input id="user-phone" v-model="form.phone" type="text" class="input" placeholder="012 345 678" />
        </div>
        <div>
          <label for="user-password" class="block text-sm text-muted mb-1">{{ creating ? $t('users.password') : $t('users.newPassword') }}</label>
          <PasswordInput id="user-password" v-model="form.password" autocomplete="new-password" :placeholder="$t('users.passwordHint')" />
        </div>
        <div v-if="creating">
          <label for="user-pin" class="block text-sm text-muted mb-1">{{ $t('users.pinLabel') }}</label>
          <input id="user-pin" v-model="form.pin" type="text" inputmode="numeric" maxlength="4" class="input font-mono" />
        </div>
        <label class="flex items-center justify-between text-sm">
          <span>{{ $t('users.accountActive') }}</span>
          <input v-model="form.active" type="checkbox" class="rounded" />
        </label>
      </section>

      <section class="space-y-4">
        <h2 class="font-heading text-base">{{ $t('users.accessSection') }}</h2>
        <div>
          <SearchableSelect
            v-model="form.roleId"
            :label="form.branchIds.length > 1 ? $t('users.mainRole') : $t('common.role')"
            :options="mainRoleOptions"
            :clearable="false"
          />
          <button
            v-if="viewableRoleIds.includes(form.roleId)"
            type="button"
            class="text-xs text-primary-text hover:underline mt-1"
            @click="emit('viewRole', form.roleId)"
          >
            {{ $t('users.viewRole') }}
          </button>
        </div>
        <MultiSearchableSelect
          :model-value="form.branchIds"
          :label="$t('users.branchAccess')"
          :options="branchAccessOptions"
          :placeholder="$t('users.noBranchAccess')"
          @update:model-value="(v) => (form.branchIds = v.map(Number))"
        />
        <div v-if="branchRoleRows.length" class="space-y-2">
          <div>
            <p class="text-sm text-muted">{{ $t('users.roleAtEachBranch') }}</p>
            <p class="text-xs text-muted">{{ $t('users.roleAtEachBranchHint') }}</p>
          </div>
          <div v-for="row in branchRoleRows" :key="row.id" class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-2">
            <span class="text-sm truncate">{{ row.name }}</span>
            <SearchableSelect :model-value="form.branchRoles[row.id] ?? 0" :options="row.options" :clearable="false" @update:model-value="(v) => setBranchRole(row.id, v)" />
          </div>
        </div>
      </section>
    </fieldset>

    <div class="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
      <button type="button" class="btn-secondary" @click="emit('cancel')">{{ readOnly ? $t('users.backToList') : $t('common.cancel') }}</button>
      <button v-if="!readOnly" type="submit" class="btn-primary" :disabled="saving">{{ creating ? $t('users.create') : $t('common.save') }}</button>
    </div>
  </form>
</template>
