import { describe, expect, it } from 'vitest'
import { calculateChange, calculateChangeIn, calculateChangeKHR, cashDue, coversRielDue, drawerStatus, otherFigure, toMajor, toMinor } from './money'
import { formatMoney } from './format'

// The same cases as the server's money_test.go: the till must agree with it
// on whether a cash payment pays the sale.
describe('change for a cash payment', () => {
  it('gives whole dollars and the rest in riel', () => {
    expect(calculateChange(270, 500, 0, 4100)).toEqual({ usdCents: 200, khrRiel: 1200, shortCents: 0 })
  })

  it('takes exactly the riel amount shown, with no change', () => {
    // $3.15 at ៛4,100 is ៛12,915, shown as ៛12,900: a cent under the dollars.
    expect(calculateChange(315, 0, 12900, 4100)).toEqual({ usdCents: 0, khrRiel: 0, shortCents: 0 })
    // ៛246 shows as ៛200: two cents under.
    expect(calculateChange(6, 0, 200, 4100)).toEqual({ usdCents: 0, khrRiel: 0, shortCents: 0 })
    // Dollars and riel together, to the riel amount.
    expect(calculateChange(315, 300, 600, 4100)).toEqual({ usdCents: 0, khrRiel: 0, shortCents: 0 })
  })

  it('is still short with less riel than shown, or dollars a cent short', () => {
    expect(calculateChange(315, 0, 12800, 4100).shortCents).toBe(3)
    expect(calculateChange(315, 314, 0, 4100).shortCents).toBe(1)
    // ៛1,845 shows as ៛1,800, and $0.44 is worth more than that, but an
    // all-dollar payment is checked to the cent.
    expect(calculateChange(45, 44, 0, 4100).shortCents).toBe(1)
  })

  it('gives change on more riel than due', () => {
    expect(calculateChange(315, 0, 20000, 4100)).toEqual({ usdCents: 100, khrRiel: 3000, shortCents: 0 })
  })
})

describe('covering the riel amount due', () => {
  it.each([
    [315, 0, 12900, true],
    [315, 0, 12899, false],
    [315, 300, 600, true],
    [315, 300, 500, false],
    [6, 0, 200, true],
    [6, 0, 100, false],
    [0, 0, 0, true],
  ])('due %i¢, $%i¢ + ៛%i → %s', (due, usd, khr, want) => {
    expect(coversRielDue(due, usd, khr, 4100)).toBe(want)
  })
})

// A riel company: the same cases as the server's TestCalculateChangeKHR.
describe('change for a riel cash payment', () => {
  it('gives all change in riel, dollars counted at the rate', () => {
    expect(calculateChangeKHR(15600, 0, 20000, 4100)).toEqual({ usdCents: 0, khrRiel: 4400, shortCents: 0 })
    // $5 is ៛20,500: ៛4,900 back.
    expect(calculateChangeKHR(15600, 500, 0, 4100)).toEqual({ usdCents: 0, khrRiel: 4900, shortCents: 0 })
    expect(calculateChangeKHR(15600, 200, 7400, 4100)).toEqual({ usdCents: 0, khrRiel: 0, shortCents: 0 })
  })

  it('takes the amount due rounded to the ៛100 note, and no less', () => {
    expect(calculateChangeKHR(17050, 0, 17100, 4100)).toEqual({ usdCents: 0, khrRiel: 0, shortCents: 0 })
    expect(calculateChangeKHR(17050, 0, 17000, 4100)).toEqual({ usdCents: 0, khrRiel: 0, shortCents: 100 })
    expect(calculateChangeKHR(17049, 0, 17000, 4100).shortCents).toBe(0)
  })

  it('rounds the change to the ៛100 note', () => {
    // $1 is ៛4,100 against ៛4,000 due (from ៛3,980): ៛100 back.
    expect(calculateChangeKHR(3980, 100, 0, 4100)).toEqual({ usdCents: 0, khrRiel: 100, shortCents: 0 })
    // $1.01 is ៛4,141: ៛141 over, ៛100 back.
    expect(calculateChangeKHR(4000, 101, 0, 4100)).toEqual({ usdCents: 0, khrRiel: 100, shortCents: 0 })
    // 1¢ more is ៛41 more: still ៛4,400 back.
    expect(calculateChangeKHR(15600, 1, 20000, 4100)).toEqual({ usdCents: 0, khrRiel: 4400, shortCents: 0 })
  })

  it('keeps the dollar rule for a dollar company', () => {
    expect(calculateChangeIn('USD', 270, 500, 0, 4100)).toEqual(calculateChange(270, 500, 0, 4100))
    expect(calculateChangeIn('KHR', 15600, 500, 0, 4100)).toEqual(calculateChangeKHR(15600, 500, 0, 4100))
  })
})

describe('amounts in the main currency', () => {
  it('pays riel cash to the ៛100 note, dollars to the cent', () => {
    expect(cashDue(17050, 'KHR')).toBe(17100)
    expect(cashDue(17049, 'KHR')).toBe(17000)
    expect(cashDue(315, 'USD')).toBe(315)
  })

  it('turns typed amounts into the minor unit and back', () => {
    expect(toMinor(1.5, 'USD')).toBe(150)
    expect(toMinor(1500, 'KHR')).toBe(1500)
    expect(toMinor(1500.4, 'KHR')).toBe(1500)
    expect(toMinor(Number.NaN, 'KHR')).toBe(0)
    expect(toMajor(150, 'USD')).toBe(1.5)
    expect(toMajor(1500, 'KHR')).toBe(1500)
  })

  it('gives the second figure in the other currency', () => {
    expect(otherFigure(315, 'USD', 4100)).toEqual({ currency: 'KHR', amount: 12900 })
    expect(otherFigure(12915, 'KHR', 4100)).toEqual({ currency: 'USD', amount: 315 })
    expect(otherFigure(12915, 'KHR', 0)).toEqual({ currency: 'USD', amount: 0 })
  })

  it('formats each currency its own way', () => {
    expect(formatMoney(1250, 'USD')).toBe('$12.50')
    expect(formatMoney(15600, 'KHR')).toBe('៛ 15,600')
  })

  it("weighs a riel company's drawer in riel", () => {
    // $1 over and ៛4,100 short at ៛4,100 is balanced either way.
    expect(drawerStatus(100, -4100, 4100, 'KHR').tone).toBe('success')
    expect(drawerStatus(100, -4100, 4100, 'USD').tone).toBe('success')
    // ៛100 short is short, ៛100 over is over.
    expect(drawerStatus(0, -100, 4100, 'KHR').tone).toBe('danger')
    expect(drawerStatus(0, 100, 4100, 'KHR').tone).toBe('warning')
  })
})
