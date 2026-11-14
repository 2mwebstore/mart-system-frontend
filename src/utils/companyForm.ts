// The rules shared by the super admin's New company form (Platform >
// Companies) and the Edit company page: a company's code and its limits.
import { normaliseCompanyCode } from '@/api/companyCode'

const codePattern = /^[A-Z0-9]{2,12}$/
export const codeOk = (raw: string) => codePattern.test(normaliseCompanyCode(raw))
// The same rule for the browser, so a wrong code is pointed out on Create or
// Save instead of the button just not working. Spaces round it are trimmed.
export const codeInputPattern = '\\s*[A-Za-z0-9]{2,12}\\s*'
// Said under the field as soon as what's typed can't be a code.
export const codeWrong = (raw: string) => raw.trim() !== '' && !codeOk(raw)

// A limit field: blank is no limit.
export type LimitField = number | ''
export const toLimit = (v: LimitField): number | null => (v === '' || v === null ? null : Number(v))
export const fromLimit = (v: number | null): LimitField => (v === null ? '' : v)
export const limitValid = (v: LimitField) => v === '' || v === null || (Number.isInteger(Number(v)) && Number(v) >= 1)
