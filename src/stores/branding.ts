import { defineStore } from 'pinia'
import * as settingsApi from '@/api/settings'
import { apiBaseURL } from '@/api/client'
import { setCompanyName, t } from '@/i18n'
import type { Branding } from '@/types/domain'

// The company's name and logo (Settings > Company), shown in the sidebar, the
// sign-in pages, the browser tab, the POS, receipts, invoices, table QR cards,
// the customer display and the QR menu. Loaded at start-up — before anyone
// signs in — and kept in localStorage so the next visit shows them at once
// instead of flashing the default name first.
const CACHE_KEY = 'com-mart-branding'
const empty: Branding = { companyName: '', hasLogo: false, logoLink: '', logoVersion: '' }

function readCache(): Branding {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? { ...empty, ...(JSON.parse(raw) as Partial<Branding>) } : { ...empty }
  } catch {
    return { ...empty }
  }
}

function logoUrlOf(b: Branding): string {
  if (b.logoLink) return b.logoLink
  return b.hasLogo ? `${apiBaseURL}/auth/branding/logo?v=${b.logoVersion}` : ''
}

// The browser tab: the company name, and the logo as the tab icon.
function applyToDocument(b: Branding) {
  setCompanyName(b.companyName)
  const href = logoUrlOf(b)
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"][data-brand]')
  if (!href) {
    link?.remove()
    return
  }
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    link.dataset.brand = ''
    document.head.appendChild(link)
  }
  link.href = href
}

export const useBrandingStore = defineStore('branding', {
  state: () => ({ ...readCache(), loaded: false }),
  getters: {
    // The system's name — "Com Mart Control System" until a company name is set.
    name: (s): string => s.companyName || t('app.name'),
    // The short form used as the store name on the POS, customer display, etc.
    shortName: (s): string => s.companyName || t('app.brand'),
    logoUrl: (s): string => logoUrlOf(s),
  },
  actions: {
    set(b: Branding) {
      this.companyName = b.companyName
      this.hasLogo = b.hasLogo
      this.logoLink = b.logoLink
      this.logoVersion = b.logoVersion
      applyToDocument(b)
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(b))
      } catch {
        // storage may be blocked; it just won't show instantly next time
      }
    },
    async refresh() {
      try {
        this.set(await settingsApi.getBranding())
      } catch {
        // offline / API down: keep the cached copy
      } finally {
        this.loaded = true
      }
    },
    // Called once at start-up; the cached copy is already showing meanwhile.
    async load() {
      applyToDocument(this.$state)
      await this.refresh()
      // Another tab (Settings) changed it: pick that up here too — e.g. the
      // customer display on the second screen.
      window.addEventListener('storage', (e) => {
        if (e.key === CACHE_KEY) this.$patch(readCache())
      })
    },
    async save(companyName: string, logo?: string) {
      this.set(await settingsApi.updateBranding(logo === undefined ? { companyName } : { companyName, logo }))
    },
  },
})
