import { defineStore } from 'pinia'
import * as settingsApi from '@/api/settings'
import type { AppSettings, Currency, ExchangeRateEntry, TaxDefaults, TaxRate } from '@/types/domain'

// Business-wide settings every screen needs (the live USD->KHR rate, receipt
// text, loyalty rate). Loaded once after sign-in and refreshed after edits.
export const useSettingsStore = defineStore('settings', {
  state: () => ({
    rate: 4100,
    rateHistory: [] as ExchangeRateEntry[],
    app: {
      receiptHeader: 'Com Mart',
      receiptFooter: '',
      loyaltyPointsPerUsd: 1,
      allowOutOfStockSale: false,
      defaultCustomerId: null,
      defaultCustomerName: '',
      taxDefaults: { pos: null, invoice: null, purchase: null, expense: null },
      mainCurrency: 'USD',
      shiftMode: 'REQUIRED',
    } as AppSettings,
    // The company's tax rates (every one, switched off too: a document keeps
    // showing the rate it used). Loaded with the settings.
    taxRates: [] as TaxRate[],
    loaded: false,
    // When the app settings were last read from the server (ms), so a
    // background re-check doesn't repeat a read just made.
    appReadAt: 0,
  }),
  getters: {
    // Whether the company works in shifts (the super admin's choice). Without
    // them, nothing about shifts shows: the till keeps one open by itself.
    usesShifts: (s) => s.app.shiftMode !== 'SKIP',
    // What the company prices and sells in (the super admin's choice): every
    // *Cents amount is in its minor unit, cents or whole riel.
    mainCurrency: (s): Currency => (s.app.mainCurrency === 'KHR' ? 'KHR' : 'USD'),
  },
  actions: {
    async load() {
      const [rate, app, taxRates] = await Promise.all([settingsApi.getExchangeRate(), settingsApi.getSettings(), settingsApi.listTaxRates()])
      this.rate = rate.rate
      this.rateHistory = rate.history
      this.app = app
      this.taxRates = taxRates
      this.loaded = true
      this.appReadAt = Date.now()
    },
    async ensureLoaded() {
      if (!this.loaded) await this.load()
    },
    async saveRate(rate: number) {
      const res = await settingsApi.setExchangeRate(rate)
      this.rate = res.rate
      this.rateHistory = res.history
    },
    async saveApp(app: AppSettings) {
      this.app = await settingsApi.updateSettings(app)
    },
    // Just the app settings and tax rates (not the exchange rate): the POS
    // re-reads them so a till left open all day picks up a new default
    // customer or starting tax.
    async refreshApp() {
      ;[this.app, this.taxRates] = await Promise.all([settingsApi.getSettings(), settingsApi.listTaxRates()])
      this.appReadAt = Date.now()
    },
    // Just the app settings, quietly: the open app's background re-check
    // (useLiveSettings), so a change made elsewhere shows without signing out.
    async refreshAppSettings() {
      this.app = await settingsApi.getSettings({ silent: true })
      this.appReadAt = Date.now()
    },
    // Settings › Tax rates.
    async refreshTaxRates() {
      this.taxRates = await settingsApi.listTaxRates()
      this.app = await settingsApi.getSettings()
    },
    async saveTaxDefaults(d: TaxDefaults) {
      this.app = { ...this.app, taxDefaults: await settingsApi.updateTaxDefaults(d) }
    },
    // Customers page: who the POS starts every sale with (null: walk-in).
    async saveDefaultCustomer(customerId: number | null) {
      this.app = await settingsApi.updateDefaultCustomer(customerId)
    },
  },
})
