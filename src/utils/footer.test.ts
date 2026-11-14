import { describe, expect, it } from 'vitest'
import { footerLine } from './footer'

describe('the footer line', () => {
  const in2027 = new Date(2027, 0, 1)

  it('shows {year} as this year, wherever and however often it appears', () => {
    expect(footerLine('© {year} Com Mart. All rights reserved.', in2027)).toBe('© 2027 Com Mart. All rights reserved.')
    expect(footerLine('© 2020–{year} Bee Soft ({year})', in2027)).toBe('© 2020–2027 Bee Soft (2027)')
  })

  it('leaves text without {year} as it is', () => {
    expect(footerLine('Bee Soft, Phnom Penh', in2027)).toBe('Bee Soft, Phnom Penh')
  })

  it('is empty for no footer', () => {
    expect(footerLine('', in2027)).toBe('')
    expect(footerLine('   ', in2027)).toBe('')
  })
})
