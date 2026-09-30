import { defineStore } from 'pinia'
import * as settingsApi from '@/api/settings'
import type { AppSettings, ExchangeRateEntry } from '@/types/domain'

// Business-wide settings every screen needs (the live USD->KHR rate, receipt
// text, loyalty rate). Loaded once after sign-in and refreshed after edits.
export const useSettingsStore = defineStore('settings', {
  state: () => ({
    rate: 4100,
    rateHistory: [] as ExchangeRateEntry[],
    app: { receiptHeader: 'Com Mart', receiptFooter: '', loyaltyPointsPerUsd: 1, allowOutOfStockSale: false } as AppSettings,
    loaded: false,
  }),
  actions: {
    async load() {
      const [rate, app] = await Promise.all([settingsApi.getExchangeRate(), settingsApi.getSettings()])
      this.rate = rate.rate
      this.rateHistory = rate.history
      this.app = app
      this.loaded = true
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
  },
})
