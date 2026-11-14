import { describe, expect, it } from 'vitest'
import type { TaxRate } from '@/types/domain'
import { formatPercent, nameFor, percentFor, startingRate, taxCents, taxTitle } from './tax'

const rate = (id: number, name: string, percent: number, active = true): TaxRate =>
  ({ id, name, percent, active }) as TaxRate

describe('taxCents (the same sums as the server)', () => {
  it.each([
    // base, percent, tax — the cases the server tests use
    [900, 10, 90],
    [505, 10, 51], // 50.5 rounds half up
    [504, 10, 50],
    [1800, 10, 180],
    [1600, 25, 400],
    [650, 10, 65],
    [1000, 7.5, 75],
    [333, 7.5, 25], // 24.975
    [1, 0.25, 0], // 0.0025
    [200, 0.25, 1], // 0.5 rounds up
    [12345, 12.345, 1525], // percent taken to hundredths: 12.35% → 1524.6
  ])('%i at %f percent is %i', (base, percent, want) => {
    expect(taxCents(base, percent)).toBe(want)
  })

  it('is nothing on no base or no percent', () => {
    expect(taxCents(0, 10)).toBe(0)
    expect(taxCents(-100, 10)).toBe(0)
    expect(taxCents(1000, 0)).toBe(0)
    expect(taxCents(1000, -5)).toBe(0)
  })
})

describe('the picked rate', () => {
  const rates = [rate(1, 'VAT 10%', 10), rate(2, 'Old', 5, false), rate(3, 'VAT 20%', 20)]

  it("uses a rate's percent now, and none for no rate or one not there", () => {
    expect(percentFor(1, rates)).toBe(10)
    expect(percentFor(null, rates)).toBe(0)
    expect(percentFor(99, rates)).toBe(0)
  })

  it('takes an inactive rate as none, unless it is the document’s own', () => {
    expect(percentFor(2, rates)).toBe(0)
    expect(percentFor(2, rates, { taxRateId: 2, taxName: 'Old', taxPercent: 5 })).toBe(5)
  })

  it('keeps the document’s own percent and name after the rate changes', () => {
    const kept = { taxRateId: 3, taxName: 'VAT', taxPercent: 10 }
    expect(percentFor(3, rates, kept)).toBe(10)
    expect(nameFor(3, rates, kept)).toBe('VAT')
    // Another rate picked on the same document is today's.
    expect(percentFor(1, rates, kept)).toBe(10)
    expect(nameFor(1, rates, kept)).toBe('VAT 10%')
  })

  it('starts from the place’s starting rate only while it is active', () => {
    expect(startingRate(1, rates)).toBe(1)
    expect(startingRate(2, rates)).toBeNull()
    expect(startingRate(99, rates)).toBeNull()
    expect(startingRate(null, rates)).toBeNull()
    expect(startingRate(undefined, rates)).toBeNull()
  })
})

describe('formatPercent', () => {
  it('drops trailing zeros', () => {
    expect(formatPercent(10)).toBe('10%')
    expect(formatPercent(7.5)).toBe('7.5%')
    expect(formatPercent(0.25)).toBe('0.25%')
    expect(formatPercent(12.3456)).toBe('12.35%')
  })
})

describe('taxTitle', () => {
  it('adds the percent to a name', () => {
    expect(taxTitle('VAT', 10)).toBe('VAT 10%')
    expect(taxTitle('', 10)).toBe('10%')
  })

  it("doesn't say the percent twice when the name already does", () => {
    expect(taxTitle('VAT 10%', 10)).toBe('VAT 10%')
    expect(taxTitle('10% levy', 10)).toBe('10% levy')
    expect(taxTitle('GST 7.5%', 7.5)).toBe('GST 7.5%')
  })

  it('still adds it when the name holds another percent', () => {
    expect(taxTitle('VAT 10%', 0)).toBe('VAT 10% 0%')
    expect(taxTitle('Old 17.5%', 7.5)).toBe('Old 17.5% 7.5%')
    expect(taxTitle('Rate 1.5%', 5)).toBe('Rate 1.5% 5%')
    expect(taxTitle('VAT 10%', 12)).toBe('VAT 10% 12%')
  })
})
