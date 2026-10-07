// The customer display is a second window (/pos/customer-display) on the
// screen facing the customer. The POS tab sends it the order as it changes
// over a BroadcastChannel: same browser, same machine, no server round-trip,
// and it keeps working if the network drops. The display only ever shows
// what it's sent; it makes no API calls of its own.

const CHANNEL = 'com-mart-customer-display'

export interface DisplayLine {
  productId: number
  nameEn: string
  nameKm: string
  imageUrl: string
  qty: number
  unitPriceCents: number
  discountCents: number
  // Set when the cashier typed the discount as a percentage (e.g. 10).
  discountPercent: number | null
  note: string
  lineTotalCents: number
}

interface Common {
  storeName: string
  tillName: string
  locale: string
}

// What the cashier has entered in the payment window so far, sent while it's
// open so the customer sees the tender and change before the sale is booked.
export interface PaymentDraft {
  method: 'CASH' | 'KHQR' | 'CARD'
  receivedUsdCents: number
  receivedKhrRiel: number
  changeUsdCents: number
  changeKhrRiel: number
  // Still to pay (cash short of the total), in USD and at the till's rate.
  shortCents: number
  shortRiel: number
}

export interface CartMessage extends Common {
  type: 'cart'
  lines: DisplayLine[]
  itemCount: number
  subtotalCents: number
  lineDiscountsCents: number
  cartDiscountCents: number
  cartDiscountPercent: number | null
  totalCents: number
  totalRiel: number
  customerName: string
  payment: PaymentDraft | null
}

export interface PaidMessage extends Common {
  type: 'paid'
  receiptNo: string
  method: string
  totalCents: number
  totalRiel: number
  receivedUsdCents: number
  receivedKhrRiel: number
  changeUsdCents: number
  changeKhrRiel: number
  pointsEarned: number
  customerName: string
}

// Sent by a display when it opens, so the POS replies with the current state.
export interface HelloMessage {
  type: 'hello'
}

export type DisplayMessage = CartMessage | PaidMessage | HelloMessage

function openChannel(): BroadcastChannel | null {
  return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL)
}

// POS side: send state, and answer a display's hello with `current()`.
export function useCustomerDisplaySender(current: () => CartMessage | PaidMessage) {
  const channel = openChannel()
  if (channel) {
    channel.onmessage = (e: MessageEvent<DisplayMessage>) => {
      if (e.data?.type === 'hello') channel.postMessage(current())
    }
  }
  return {
    // Plain-object copy: reactive proxies can't be structured-cloned.
    send: (msg: CartMessage | PaidMessage) => channel?.postMessage(JSON.parse(JSON.stringify(msg))),
    close: () => channel?.close(),
  }
}

// Display side: receive state; says hello once so it doesn't wait for the
// next change at the till to show something.
export function useCustomerDisplayReceiver(onMessage: (msg: CartMessage | PaidMessage) => void) {
  const channel = openChannel()
  if (channel) {
    channel.onmessage = (e: MessageEvent<DisplayMessage>) => {
      if (e.data && e.data.type !== 'hello') onMessage(e.data)
    }
    channel.postMessage({ type: 'hello' } satisfies HelloMessage)
  }
  return { supported: channel !== null, close: () => channel?.close() }
}

// Opens (or focuses) the display window; the cashier drags it to the
// customer-facing screen and makes it full screen.
export function openCustomerDisplay() {
  window.open('/pos/customer-display', 'com-mart-customer-display', 'popup,width=1280,height=800')
}
