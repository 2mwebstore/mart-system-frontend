// The footer line as shown: "{year}" becomes this year (the browser's clock),
// so a copyright set once stays current.
export const FOOTER_YEAR = '{year}'

export function footerLine(text: string, now: Date = new Date()): string {
  return (text ?? '').split(FOOTER_YEAR).join(String(now.getFullYear())).trim()
}
