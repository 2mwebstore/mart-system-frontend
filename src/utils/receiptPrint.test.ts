import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { printReceipt, receiptPageMm } from './receiptPrint'

// What the page holds while the browser prints.
interface Printed {
  sheet: string
  sheetId: string | null
  copyId: string | null
  page: string
  printing: boolean
}
let printed: Printed[] = []

// The receipt as the screen shows it: in a dialog, with its buttons.
function receiptOnScreen() {
  document.body.innerHTML = `
    <div id="app">
      <div role="dialog">
        <h2>Payment complete</h2><button>×</button>
        <div id="pos-receipt" class="font-mono"><p>EMart24</p><p>1× Tea $1.00</p>
          <div class="flex print:hidden"><button>Print</button></div>
        </div>
      </div>
    </div>`
  return document.getElementById('pos-receipt')!
}

beforeEach(() => {
  printed = []
  vi.spyOn(window, 'print').mockImplementation(() => {
    const sheet = document.getElementById('receipt-print')
    printed.push({
      sheet: sheet?.innerHTML ?? '',
      sheetId: sheet?.parentElement === document.body ? sheet.id : null,
      copyId: sheet?.firstElementChild?.getAttribute('id') ?? null,
      page: document.getElementById('receipt-print-page')?.textContent ?? '',
      printing: document.documentElement.classList.contains('printing-receipt'),
    })
  })
  // jsdom lays nothing out: the sheet measures 377 px (just under 100 mm) tall.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return { height: this.id === 'receipt-print' ? 377 : 0 } as DOMRect
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  window.dispatchEvent(new Event('afterprint'))
  document.body.innerHTML = ''
})

describe('printing a receipt', () => {
  it('prints a copy of the receipt alone, without its buttons', () => {
    printReceipt(receiptOnScreen())
    expect(printed).toHaveLength(1)
    const [p] = printed
    expect(p.printing).toBe(true)
    expect(p.sheetId).toBe('receipt-print')
    // The copy has no id of its own, so the screen's receipt stays the only one.
    expect(p.copyId).toBeNull()
    expect(p.sheet).toContain('1× Tea $1.00')
    expect(p.sheet).not.toContain('Print')
    expect(p.sheet).not.toContain('Payment complete')
  })

  it('makes the page 80 mm wide and as long as the receipt', () => {
    printReceipt(receiptOnScreen())
    expect(printed[0].page).toBe('@page { size: 80mm 102mm; margin: 0; }')
  })

  it('rounds the length up, with a little to spare', () => {
    expect(receiptPageMm(377)).toBe(102) // 99.7 mm
    expect(receiptPageMm(379)).toBe(103) // 100.3 mm
    expect(receiptPageMm(0)).toBe(2)
  })

  it('puts its page size last, over any other page size', () => {
    const a4 = document.createElement('style')
    a4.textContent = '@page { size: A4 }'
    document.head.appendChild(a4)
    vi.mocked(window.print).mockImplementation(() => {
      expect(document.head.lastElementChild?.id).toBe('receipt-print-page')
    })
    printReceipt(receiptOnScreen())
    a4.remove()
  })

  it('leaves the screen as it was once printing is done', () => {
    printReceipt(receiptOnScreen())
    window.dispatchEvent(new Event('afterprint'))
    expect(document.getElementById('receipt-print')).toBeNull()
    expect(document.getElementById('receipt-print-page')).toBeNull()
    expect(document.documentElement.classList.contains('printing-receipt')).toBe(false)
    expect(document.getElementById('pos-receipt')?.textContent).toContain('Print')
  })

  it('prints only the latest receipt when the browser never said it was done', () => {
    const receipt = receiptOnScreen()
    printReceipt(receipt)
    receipt.querySelector('p')!.textContent = 'Reprint'
    printReceipt(receipt)
    expect(document.querySelectorAll('#receipt-print')).toHaveLength(1)
    expect(document.querySelectorAll('#receipt-print-page')).toHaveLength(1)
    expect(printed[1].sheet).toContain('Reprint')
  })
})
