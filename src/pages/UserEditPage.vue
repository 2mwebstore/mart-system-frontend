<script setup lang="ts">
// New user / edit user as a page of its own (/users/new, /users/:id/edit), like
// invoices: the form has an account half and an access half, which a side
// panel squeezed. Saving or deleting goes back to the Users list.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, KeyRound } from 'lucide-vue-next'
import * as peopleApi from '@/api/people'
import type { UserInput } from '@/api/people'
import type { Role, StaffUser } from '@/types/domain'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import UserForm from '@/components/users/UserForm.vue'
import ResetPinDialog from '@/components/users/ResetPinDialog.vue'
import ConfirmDelete from '@/components/ConfirmDelete.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { t } from '@/i18n'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const toast = useToast()

const editId = computed(() => (route.params.id ? Number(route.params.id) : null))
const user = ref<StaffUser | null>(null)
// Every role the viewer can see, and those of the active branch.
const roles = ref<Role[]>([])
const branchRoles = ref<Role[]>([])
const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const resettingPin = ref(false)

const canCreate = computed(() => auth.hasPermission('user.create'))
const canEdit = computed(() => auth.hasPermission('user.update'))
const canDelete = computed(() => auth.hasPermission('user.delete'))
// Someone who also works at branches the viewer doesn't manage: the server
// won't let the viewer change them, so the page only shows them.
const elsewhere = computed(() => !!user.value?.hasOtherBranches)
const readOnly = computed(() => (editId.value === null ? !canCreate.value : elsewhere.value || !canEdit.value))
const isSelf = computed(() => user.value !== null && user.value.id === auth.user?.id)

const defaultRoleId = computed(() => branchRoles.value.find((r) => r.name === 'Cashier')?.id ?? branchRoles.value[0]?.id ?? roles.value[0]?.id ?? 0)
const viewableRoleIds = computed(() => (auth.hasPermission('role.view') ? branchRoles.value.map((r) => r.id) : []))

onMounted(async () => {
  try {
    const [all, here, u] = await Promise.all([
      peopleApi.listRoles(),
      peopleApi.listRoles(auth.activeBranchId),
      editId.value !== null ? peopleApi.getUser(editId.value) : Promise.resolve(null),
    ])
    roles.value = all
    branchRoles.value = here
    user.value = u
  } catch {
    loadError.value = t('users.loadFailed')
  } finally {
    loading.value = false
  }
})

function back() {
  router.push({ name: 'users' })
}

async function save(input: UserInput) {
  saving.value = true
  try {
    if (user.value) {
      await peopleApi.updateUser(user.value.id, input)
      toast.success(t('users.saved'))
    } else {
      await peopleApi.createUser(input)
      toast.success(t('users.created'))
    }
    back()
  } catch {
    // the API client already toasted the reason
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!user.value) return
  try {
    await peopleApi.deleteUser(user.value.id)
    toast.success(t('users.deleted'))
    back()
  } catch {
    // the API client already showed why (USER_IN_USE opens the in-use alert)
  }
}

function viewRole(id: number) {
  router.push({ name: 'roles', query: { role: String(id) } })
}
</script>

<template>
  <div class="p-4 sm:p-8 space-y-6">
    <div class="space-y-2">
      <RouterLink :to="{ name: 'users' }" class="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft class="w-4 h-4" /> {{ $t('users.backToList') }}
      </RouterLink>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="font-heading text-2xl">{{ user ? $t('users.editTitle', { name: user.fullName }) : $t('users.new') }}</h1>
            <span v-if="user" class="font-mono text-xs text-muted">#{{ user.id }}</span>
            <StatusBadge v-if="user && readOnly" :label="$t('users.readOnly')" tone="neutral" />
          </div>
          <p v-if="user" class="text-muted text-sm">@{{ user.username }}</p>
        </div>
        <div v-if="user && !elsewhere" class="flex items-center gap-2">
          <button v-if="canEdit" type="button" class="btn-secondary flex items-center gap-2" @click="resettingPin = true">
            <KeyRound :stroke-width="1.8" class="w-4 h-4" /> {{ $t('users.resetPin') }}
          </button>
          <ConfirmDelete v-if="canDelete && !isSelf" :item-label="$t('entity.user')" :item-name="user.fullName" size="md" @confirm="remove" />
        </div>
      </div>
    </div>

    <p v-if="loading" class="text-muted">{{ $t('tableMenu.loading') }}</p>
    <div v-else-if="loadError" class="card space-y-3">
      <p class="text-danger-strong">{{ loadError }}</p>
      <button type="button" class="btn-secondary" @click="back">{{ $t('users.backToList') }}</button>
    </div>
    <div v-else class="card space-y-4">
      <p v-if="elsewhere" class="text-sm text-muted">{{ $t('users.otherBranchesNote') }}</p>
      <p v-else-if="readOnly" class="text-sm text-muted">{{ $t('users.viewOnly') }}</p>
      <UserForm
        :user="user"
        :roles="roles"
        :default-role-id="defaultRoleId"
        :viewable-role-ids="viewableRoleIds"
        :read-only="readOnly"
        :saving="saving"
        @save="save"
        @cancel="back"
        @view-role="viewRole"
      />
    </div>

    <ResetPinDialog v-if="resettingPin && user" :user-id="user.id" :name="user.fullName" @close="resettingPin = false" />
  </div>
</template>
