import { defineStore } from 'pinia'
import * as settingsApi from '@/api/settings'
import { apiBaseURL } from '@/api/client'
import { getCompanyCode } from '@/api/companyCode'
import { setCompanyName, t } from '@/i18n'
import type { Branding } from '@/types/domain'

// The company's name and logo (Settings > Company), shown in the sidebar, the
// sign-in pages, the browser tab, the POS, receipts, invoices, table QR cards,
// the customer display and the QR menu. Loaded at start-up — before anyone
// signs in — and kept in localStorage so the next visit shows them at once
// instead of flashing the default name first.
//
// Each company has its own: this is the company this browser works for (see
// api/companyCode.ts), and the app's own name and no logo when there's none.
// The footer line comes with them; it's the super admin's, the same for all.
const CACHE_KEY = 'com-mart-branding'
const empty: Branding = { companyName: '', hasLogo: false, logoLink: '', logoVersion: '', footerText: '' }

function readCache(): Branding {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? { ...empty, ...(JSON.parse(raw) as Partial<Branding>) } : { ...empty }
  } catch {
    return { ...empty }
  }
}

function logoUrlOf(b: Branding, code = getCompanyCode()): string {
  if (b.logoLink) return b.logoLink
  return b.hasLogo ? `${apiBaseURL}/auth/branding/logo?company=${encodeURIComponent(code)}&v=${b.logoVersion}` : ''
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
  // code: the company these are for, '' for the app's own.
  state: () => ({ ...readCache(), code: getCompanyCode(), loaded: false }),
  getters: {
    // The system's name — "Com Mart Control System" until a company name is set.
    name: (s): string => s.companyName || t('app.name'),
    // The short form used as the store name on the POS, customer display, etc.
    shortName: (s): string => s.companyName || t('app.brand'),
    logoUrl: (s): string => logoUrlOf(s, s.code),
  },
  actions: {
    set(b: Branding) {
      this.companyName = b.companyName
      this.hasLogo = b.hasLogo
      this.logoLink = b.logoLink
      this.logoVersion = b.logoVersion
      this.footerText = b.footerText ?? ''
      applyToDocument(b)
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(b))
      } catch {
        // storage may be blocked; it just won't show instantly next time
      }
    },
    async refresh() {
      const code = getCompanyCode()
      this.code = code
      try {
        const b = await settingsApi.getBranding(code)
        // Another company chosen meanwhile: this answer is out of date.
        if (this.code === code) this.set(b)
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
    // Shows the company with this code from now on (already remembered by
    // the caller), unless it's the one showing. '' shows the app's own name
    // and no logo, which is what the server gives without a code.
    async useCompany(code: string) {
      if (code === this.code && this.loaded) return
      if (!code) {
        this.code = ''
        // No company's name or logo; the footer is everyone's, so it stays.
        this.set({ ...empty, footerText: this.footerText })
        this.loaded = true
        return
      }
      await this.refresh()
    },
    // The super admin saved a new footer: shown at once, here and next visit.
    setFooterText(footerText: string) {
      const { companyName, hasLogo, logoLink, logoVersion } = this
      this.set({ companyName, hasLogo, logoLink, logoVersion, footerText })
    },
    async save(companyName: string, logo?: string) {
      this.set(await settingsApi.updateBranding(logo === undefined ? { companyName } : { companyName, logo }))
    },
  },
})
