// Prints a receipt (or a shift report) on the till's receipt printer: 80 mm
// roll paper, with nothing but the receipt itself. No dialog title, close
// button, buttons or card border, the receipt as wide as the printer prints,
// and the page exactly as long as the receipt, so the printer doesn't feed a
// whole page of blank paper after it.
//
// An 80 mm printer prints only the middle 72 mm of the paper, and its driver
// puts the page's left edge where that starts (4 mm in). So the page is those
// 72 mm: a page as wide as the paper came out 4 mm to the right, its last
// 4 mm cut off.
//
// The receipt is copied into a sheet of its own (#receipt-print, styled in
// style.css) that is the only thing printed, and measured there at the
// paper's width to size the page.
//
// The sheet stays ready until the receipt is closed (clearReceiptPrint, from
// the page or dialog that printed it) or the next print, not just until the
// browser says printing is done: Chrome on Android says so (afterprint) as
// soon as print() returns, before Android has laid the page out for the
// printer. Tidied up then, the printer got the screen as it was: the dialog
// with its title, ×, and border, over two pages. Off-screen and only in
// effect when printing, the sheet changes nothing on screen meanwhile.

export const RECEIPT_PRINT_MM = 72
// A little paper to spare, so rounding never spills the last line onto a
// second page.
const SPARE_MM = 2
const PX_PER_MM = 96 / 25.4

const SHEET_ID = 'receipt-print'
const PAGE_STYLE_ID = 'receipt-print-page'
const PRINTING_CLASS = 'printing-receipt'

// Removes the print sheet and its page size: printing is back to normal.
export function clearReceiptPrint() {
  document.getElementById(SHEET_ID)?.remove()
  document.getElementById(PAGE_STYLE_ID)?.remove()
  document.documentElement.classList.remove(PRINTING_CLASS)
}

// The page height, in whole millimetres, for a sheet this tall.
export function receiptPageMm(heightPx: number) {
  return Math.ceil(heightPx / PX_PER_MM) + SPARE_MM
}

export function printReceipt(source: HTMLElement) {
  clearReceiptPrint() // the last receipt printed, if still there

  const copy = source.cloneNode(true) as HTMLElement
  copy.removeAttribute('id')
  // What the screen hides from print (its buttons) takes no paper either.
  copy.querySelectorAll('[class~="print:hidden"]').forEach((el) => el.remove())

  const sheet = document.createElement('div')
  sheet.id = SHEET_ID
  sheet.appendChild(copy)
  document.body.appendChild(sheet)

  const page = document.createElement('style')
  page.id = PAGE_STYLE_ID
  page.textContent = `@page { size: ${RECEIPT_PRINT_MM}mm ${receiptPageMm(sheet.getBoundingClientRect().height)}mm; margin: 0; }`
  // Last in <head>, so it wins over another page's @page (an invoice's A4).
  document.head.appendChild(page)

  document.documentElement.classList.add(PRINTING_CLASS)
  window.print()
}
