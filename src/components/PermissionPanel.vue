<script setup lang="ts">
// Ticking what a role can do, laid out like the sidebar: a caption per
// sidebar section, a card per main menu (Inventory, Settings…), and inside it
// a block per sub-menu (Products, Categories…) with its permissions. Each
// level has a checkbox for all of it and a count. The permission that opens
// a page is marked, so it's clear what makes a sub-menu appear. Search
// narrows it; "Select all" / "Clear" act on what's shown.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Permission } from '@/types/domain'
import { groupByMenu, pagesOf } from '@/utils/permissionMenu'
import { PAGE_ACCESS } from '@/utils/pageAccess'
import { permissionLabel } from '@/i18n'
import SearchInput from '@/components/SearchInput.vue'

const model = defineModel<string[]>({ required: true })
const props = withDefaults(defineProps<{ permissions: Permission[]; disabled?: boolean }>(), { disabled: false })
const { t, locale } = useI18n()

const search = ref('')
const selected = computed(() => new Set(model.value))
const nameOf = (p: Permission) => permissionLabel(p.key, p.description)
const byKey = computed(() => new Map(props.permissions.map((p) => [p.key, p])))
const unique = (keys: string[]) => [...new Set(keys)]
const grantedOf = (keys: string[]) => keys.filter((k) => selected.value.has(k)).length

// Searching matches a permission (shown name, server wording, key) or a
// section, menu or sub-menu by name ("POS", "products"…), which shows all of it.
const sections = computed(() => {
  const q = search.value.trim().toLocaleLowerCase()
  const matches = (...texts: (string | undefined)[]) => !q || texts.some((s) => (s ?? '').toLocaleLowerCase().includes(q))
  return groupByMenu(props.permissions)
    .map((section) => {
      const caption = section.captionKey ? t(section.captionKey) : ''
      const menus = section.menus
        .map((menu) => {
          const label = t(menu.labelKey)
          const subs = menu.subs
            .map((sub) => {
              const subLabel = t(sub.labelKey)
              const items = matches(caption, label, menu.hasSubs ? subLabel : '')
                ? sub.items
                : sub.items.filter((p) => matches(nameOf(p), p.description, p.key))
              const keys = items.map((p) => p.key)
              const opens = sub.route ? (PAGE_ACCESS[sub.route] ?? []) : []
              return { key: sub.key, label: subLabel, path: menu.hasSubs ? [menu.labelKey, sub.labelKey] : [menu.labelKey], items, keys, opens, granted: grantedOf(keys) }
            })
            .filter((sub) => sub.items.length > 0)
          // A permission on several sub-menus counts once.
          const keys = unique(subs.flatMap((sub) => sub.keys))
          return { key: menu.key, label, icon: menu.icon, hasSubs: menu.hasSubs, subs, keys, granted: grantedOf(keys) }
        })
        .filter((menu) => menu.subs.length > 0)
      const keys = unique(menus.flatMap((menu) => menu.keys))
      return { key: section.key, caption, menus, keys, granted: grantedOf(keys) }
    })
    .filter((section) => section.menus.length > 0)
})
const visibleKeys = computed(() => unique(sections.value.flatMap((s) => s.keys)))
const allVisibleGranted = computed(() => visibleKeys.value.length > 0 && visibleKeys.value.every((k) => selected.value.has(k)))
const anyVisibleGranted = computed(() => visibleKeys.value.some((k) => selected.value.has(k)))

// The other pages a permission is also on (ticking it here ticks it there).
function alsoOn(key: string, path: string[]) {
  const here = path.join('›')
  return pagesOf(key)
    .filter((p) => p.join('›') !== here)
    .map((p) => p.map((k) => t(k)).join(' › '))
    .join(', ')
}

// "Opens with Sell at the till or View sales reports." when more than one
// permission opens the page.
function opensWith(keys: readonly string[]) {
  const names = keys.map((k) => {
    const p = byKey.value.get(k)
    return p ? nameOf(p) : k
  })
  return t('users.permOpensWith', { names: new Intl.ListFormat(locale.value, { type: 'disjunction' }).format(names) })
}

function setMany(keys: string[], on: boolean) {
  if (props.disabled) return
  const next = new Set(model.value)
  for (const k of keys) {
    if (on) next.add(k)
    else next.delete(k)
  }
  // Catalog order, so a saved role reads the same way every time; anything
  // the catalog doesn't list is kept as it was.
  const catalog = props.permissions.map((p) => p.key)
  model.value = [...catalog.filter((k) => next.has(k)), ...model.value.filter((k) => !catalog.includes(k) && next.has(k))]
}
const checked = (e: Event) => (e.target as HTMLInputElement).checked
const full = (g: { granted: number; keys: string[] }) => g.keys.length > 0 && g.granted === g.keys.length
const partial = (g: { granted: number; keys: string[] }) => g.granted > 0 && g.granted < g.keys.length
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-2.5 rounded-card border border-line bg-surface-subtle p-2.5">
      <SearchInput v-model="search" :placeholder="$t('users.permSearch')" class="min-w-0 flex-1 basis-56 sm:!w-auto" />
      <i18n-t keypath="users.permSelected" tag="span" class="order-3 whitespace-nowrap text-xs text-muted sm:order-none" scope="global">
        <template #n>
          <strong class="font-semibold text-primary-text">{{ model.length }}</strong>
        </template>
        <template #total>{{ permissions.length }}</template>
      </i18n-t>
      <div class="flex gap-1.5 sm:ml-auto">
        <button type="button" class="bulk-btn" :disabled="disabled || allVisibleGranted" @click="setMany(visibleKeys, true)">{{ $t('common.selectAll') }}</button>
        <button type="button" class="bulk-btn" :disabled="disabled || !anyVisibleGranted" @click="setMany(visibleKeys, false)">{{ $t('common.clear') }}</button>
      </div>
    </div>

    <p v-if="sections.length === 0" class="rounded-control bg-surface-subtle p-4 text-center text-sm text-muted">
      {{ permissions.length ? $t('users.permNoMatch') : $t('users.permNone') }}
    </p>

    <section v-for="section in sections" :key="section.key" class="space-y-2" :data-perm-section="section.key">
      <label v-if="section.caption" class="flex cursor-pointer items-center gap-2.5 px-0.5 pt-1">
        <input
          type="checkbox"
          class="perm-check"
          :checked="full(section)"
          :indeterminate="partial(section)"
          :disabled="disabled"
          :aria-label="$t('users.permSelectGroup', { name: section.caption })"
          @change="setMany(section.keys, checked($event))"
        />
        <span class="perm-caption flex-1 text-[11px] font-bold uppercase tracking-[.13em] text-muted">{{ section.caption }}</span>
        <span class="text-xs font-semibold tabular-nums text-muted">{{ section.granted }}/{{ section.keys.length }}</span>
      </label>

      <div class="grid grid-cols-1 items-start gap-3 sm:grid-cols-[repeat(auto-fill,minmax(250px,1fr))]">
        <section
          v-for="menu in section.menus"
          :key="menu.key"
          class="overflow-hidden rounded-card border bg-surface transition-colors"
          :class="[full(menu) ? 'border-primary/50' : 'border-line', menu.hasSubs ? 'sm:col-span-full' : '']"
          :data-perm-menu="menu.key"
        >
          <!-- The main menu -->
          <label class="flex cursor-pointer items-center gap-2.5 border-b border-line bg-surface-subtle px-3 py-2.5">
            <input
              type="checkbox"
              class="perm-check"
              :checked="full(menu)"
              :indeterminate="partial(menu)"
              :disabled="disabled"
              :aria-label="$t('users.permSelectGroup', { name: menu.label })"
              @change="setMany(menu.keys, checked($event))"
            />
            <span
              class="grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors"
              :class="full(menu) ? 'bg-primary text-primary-ink' : 'bg-sidebar text-white'"
            >
              <component :is="menu.icon" :stroke-width="2" class="h-4 w-4" />
            </span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-sm font-semibold">{{ menu.label }}</span>
              <span v-if="menu.hasSubs" class="truncate text-[11px] text-muted">{{ $t('users.permSubMenus', { n: menu.subs.length }, menu.subs.length) }}</span>
            </span>
            <span
              class="rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
              :class="full(menu) ? 'bg-primary-tint text-primary-tint-text' : 'bg-page text-muted'"
            >
              {{ menu.granted }}/{{ menu.keys.length }}
            </span>
          </label>

          <!-- Sub-menus side by side; each cell draws its right and bottom
               edge, and the card clips those on the outside. -->
          <div :class="menu.hasSubs ? '-mb-px -mr-px grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]' : ''">
            <div v-for="sub in menu.subs" :key="sub.key" :class="menu.hasSubs ? 'border-b border-r border-line' : ''" :data-perm-sub="sub.key">
              <!-- A sub-menu -->
              <label
                v-if="menu.hasSubs"
                class="flex cursor-pointer items-center gap-2 border-b border-line/70 px-3 py-2"
                :class="full(sub) ? 'bg-primary-tint-row' : ''"
              >
                <input
                  type="checkbox"
                  class="perm-check"
                  :checked="full(sub)"
                  :indeterminate="partial(sub)"
                  :disabled="disabled"
                  :aria-label="$t('users.permSelectGroup', { name: `${menu.label} › ${sub.label}` })"
                  @change="setMany(sub.keys, checked($event))"
                />
                <span class="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{{ sub.label }}</span>
                <span class="text-[11px] font-semibold tabular-nums text-muted">{{ sub.granted }}/{{ sub.keys.length }}</span>
              </label>
              <p v-if="sub.opens.length > 1" class="border-b border-line/70 bg-surface-subtle px-3 py-1.5 text-[11px] text-muted">
                {{ opensWith(sub.opens) }}
              </p>
              <label
                v-for="p in sub.items"
                :key="p.key"
                class="flex items-start gap-2.5 border-b border-line/70 py-2.5 pr-3 transition-colors last:border-0"
                :class="[
                  menu.hasSubs ? 'pl-6' : 'pl-3',
                  selected.has(p.key) ? 'bg-primary-tint-row' : 'hover:bg-surface-subtle',
                  disabled ? 'cursor-default' : 'cursor-pointer',
                ]"
              >
                <input type="checkbox" class="perm-check mt-px" :checked="selected.has(p.key)" :disabled="disabled" @change="setMany([p.key], checked($event))" />
                <span class="flex min-w-0 flex-col gap-0.5">
                  <span class="text-[13px] font-medium leading-snug text-ink">
                    {{ nameOf(p) }}
                    <span v-if="sub.opens.includes(p.key)" class="opens-tag">{{ $t('users.permOpensPage') }}</span>
                  </span>
                  <span class="break-all font-mono text-[11px] text-muted">{{ p.key }}</span>
                  <span v-if="alsoOn(p.key, sub.path)" class="text-[11px] font-medium text-primary-text">
                    {{ $t('users.permAlsoOn', { pages: alsoOn(p.key, sub.path) }) }}
                  </span>
                </span>
              </label>
            </div>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>

<style scoped>
.perm-check {
  @apply h-[18px] w-[18px] shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed;
}
.opens-tag {
  @apply ml-1 inline-block rounded-full bg-page px-1.5 py-px align-[1px] text-[10px] font-semibold text-muted;
}
.bulk-btn {
  @apply min-h-[34px] rounded-lg border border-line bg-surface px-3 text-xs font-semibold text-ink transition hover:bg-surface-subtle;
  @apply disabled:cursor-default disabled:text-muted/50 disabled:hover:bg-surface;
}
/* Khmer has no capitals, and spacing breaks its clusters apart. */
:lang(km) .perm-caption {
  letter-spacing: normal;
}
</style>
