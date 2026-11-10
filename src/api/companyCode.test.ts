import { beforeEach, describe, expect, it } from 'vitest'
import { COMPANY_CODE_KEY, getCompanyCode, normaliseCompanyCode, setCompanyCode } from './companyCode'

describe('company code', () => {
  beforeEach(() => localStorage.clear())

  it('is kept the way the server keeps it: trimmed and upper case', () => {
    expect(normaliseCompanyCode('  cm ')).toBe('CM')
    expect(normaliseCompanyCode('d2')).toBe('D2')
  })

  it('is remembered on the device until it is cleared', () => {
    expect(getCompanyCode()).toBe('')
    setCompanyCode('D2')
    expect(localStorage.getItem(COMPANY_CODE_KEY)).toBe('D2')
    expect(getCompanyCode()).toBe('D2')
    setCompanyCode('')
    expect(getCompanyCode()).toBe('')
  })
})
