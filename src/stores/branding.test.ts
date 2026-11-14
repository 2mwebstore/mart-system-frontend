import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { COMPANY_CODE_KEY, setCompanyCode } from '@/api/companyCode'
import type { Branding } from '@/types/domain'
import { useBrandingStore } from './branding'

// Each answer waits until the test lets it through.
const server = vi.hoisted(() => ({ pending: [] as { code: string; answer: (b: Branding) => void }[] }))
vi.mock('@/api/settings', () => ({
  getBranding: (code: string) => new Promise<Branding>((answer) => server.pending.push({ code, answer })),
}))

const named = (companyName: string, footerText = '© {year} Com Mart'): Branding => ({ companyName, hasLogo: false, logoLink: '', logoVersion: '', footerText })

beforeEach(() => {
  localStorage.clear()
  server.pending = []
  setActivePinia(createPinia())
})

describe('the branding store', () => {
  it('shows the app’s own name for no company, at once', async () => {
    setCompanyCode('CM')
    const branding = useBrandingStore()
    const loading = branding.useCompany('CM')
    server.pending[0].answer(named('CM Shop'))
    await loading
    expect(branding.companyName).toBe('CM Shop')

    setCompanyCode('')
    await branding.useCompany('')
    expect(branding.companyName).toBe('')
    expect(branding.code).toBe('')
    expect(server.pending).toHaveLength(1)
    // The footer is every company's, so no company keeps it too.
    expect(branding.footerText).toBe('© {year} Com Mart')
  })

  it('shows a footer the super admin saves at once, and next visit', async () => {
    setCompanyCode('CM')
    const branding = useBrandingStore()
    const loading = branding.useCompany('CM')
    server.pending[0].answer(named('CM Shop'))
    await loading
    branding.setFooterText('© {year} Bee Soft')
    expect(branding.footerText).toBe('© {year} Bee Soft')
    expect(branding.companyName).toBe('CM Shop')

    setActivePinia(createPinia())
    const next = useBrandingStore()
    expect(next.footerText).toBe('© {year} Bee Soft')
    expect(next.companyName).toBe('CM Shop')
  })

  it('drops a late answer for a company no longer chosen', async () => {
    setCompanyCode('CM')
    const branding = useBrandingStore()
    const loading = branding.useCompany('CM')
    // "Change company" before the server has answered for CM.
    localStorage.removeItem(COMPANY_CODE_KEY)
    await branding.useCompany('')
    server.pending[0].answer(named('CM Shop'))
    await loading
    expect(branding.companyName).toBe('')
  })
})
