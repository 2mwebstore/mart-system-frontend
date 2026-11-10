// The company this browser works for, by its code: remembered so the till's
// sign-in screen lists that company's tills without asking again, and so the
// sign-in pages show that company's name and logo. A password sign-in sets it
// from the session; the till's sign-in screen sets it when the code is typed.
export const COMPANY_CODE_KEY = 'com-mart-company-code'

export function getCompanyCode(): string {
  try {
    return localStorage.getItem(COMPANY_CODE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setCompanyCode(code: string) {
  try {
    if (code) localStorage.setItem(COMPANY_CODE_KEY, code)
    else localStorage.removeItem(COMPANY_CODE_KEY)
  } catch {
    // storage may be blocked; the code is just asked for again next time
  }
}

// Codes are stored and compared in upper case, as the server keeps them.
export function normaliseCompanyCode(raw: string): string {
  return raw.trim().toUpperCase()
}
