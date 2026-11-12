// Prints a receipt (or a shift report) on the till's receipt printer: 80 mm
// roll paper, with nothing but the receipt itself. No dialog title, close
// button, buttons or card border, the receipt as wide as the paper, and the
// page exactly as long as the receipt, so the printer doesn't feed a whole
// page of blank paper after it.
//
// The receipt is copied into a sheet of its own (#receipt-print, styled in
// style.css) that is the only thing printed, and measured there at the
// paper's width to size the page. Everything is removed once printing is
// done.

export const RECEIPT_PAPER_MM = 80
// A little paper to spare, so rounding never spills the last line onto a
// second page.
const SPARE_MM = 2
const PX_PER_MM = 96 / 25.4

const SHEET_ID = 'receipt-print'
const PAGE_STYLE_ID = 'receipt-print-page'
const PRINTING_CLASS = 'printing-receipt'

function cleanUp() {
  document.getElementById(SHEET_ID)?.remove()
  document.getElementById(PAGE_STYLE_ID)?.remove()
  document.documentElement.classList.remove(PRINTING_CLASS)
  window.removeEventListener('afterprint', cleanUp)
}

// The page height, in whole millimetres, for a sheet this tall.
export function receiptPageMm(heightPx: number) {
  return Math.ceil(heightPx / PX_PER_MM) + SPARE_MM
}

export function printReceipt(source: HTMLElement) {
  cleanUp() // anything left from a print the browser never reported done

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
  page.textContent = `@page { size: ${RECEIPT_PAPER_MM}mm ${receiptPageMm(sheet.getBoundingClientRect().height)}mm; margin: 0; }`
  // Last in <head>, so it wins over another page's @page (an invoice's A4).
  document.head.appendChild(page)

  document.documentElement.classList.add(PRINTING_CLASS)
  window.addEventListener('afterprint', cleanUp)
  window.print()
}
