import { createI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import 'dayjs/locale/km'
import en from './en.json'
import km from './km.json'

const STORAGE_KEY = 'com-mart-locale'

export type Locale = 'en' | 'km'

function initialLocale(): Locale {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'km' ? 'km' : 'en'
  } catch {
    return 'en'
  }
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'en',
  messages: { en, km },
})

// Translate outside a component (stores, API client, composables that run
// after setup). Reads the reactive locale, so it also re-renders correctly
// when called inside a template or computed.
export const t = i18n.global.t

function applyLocale(locale: Locale) {
  document.documentElement.lang = locale
  dayjs.locale(locale) // month / weekday names in the date pickers
  document.title = i18n.global.t('app.name')
}
applyLocale(i18n.global.locale.value)

export function setLocale(locale: Locale) {
  i18n.global.locale.value = locale
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // storage may be blocked; the choice just won't persist
  }
  applyLocale(locale)
}

// A bilingual record (category): the Khmer name when the app is in Khmer and
// one was entered, otherwise the English one.
export function localName(en: string | null | undefined, km: string | null | undefined): string {
  return i18n.global.locale.value === 'km' && km ? km : (en ?? '')
}

export function categoryName(en: string | null | undefined, km: string | null | undefined): string {
  if (!en || en === 'Uncategorised') return i18n.global.t('common.uncategorised')
  return localName(en, km)
}

// Seeded roles / permissions carry an English description from the database.
// It is translated only while it is still the untouched default (compared with
// the English message), so a description someone edited is shown as written.
function englishMessage(key: string): string | undefined {
  let node: unknown = i18n.global.getLocaleMessage('en')
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : undefined
}

// A stored name that is still the untouched English default (e.g. the seeded
// payment method "Cash") is shown in the current language; a renamed one is
// shown exactly as entered.
export function seededLabel(prefix: string, value: string, name: string): string {
  const key = `${prefix}.${value}`
  return englishMessage(key) === name ? i18n.global.t(key) : name
}

export function roleDescription(name: string, description: string): string {
  const key = `roleDesc.${name}`
  return englishMessage(key) === description ? i18n.global.t(key) : description
}

export function permissionLabel(key: string, description: string): string {
  const k = `perm.${key}`
  return i18n.global.te(k) && englishMessage(k) === description ? i18n.global.t(k) : description
}

// Server data that has a translation (statuses, payment methods, movement
// types, role names, ...): "prefix.KEY" if that key exists, otherwise the raw
// value, so an unknown or user-defined value still shows something sensible.
export function label(prefix: string, value: string | null | undefined): string {
  if (!value) return ''
  const key = `${prefix}.${value}`
  return i18n.global.te(key) ? i18n.global.t(key) : value
}
