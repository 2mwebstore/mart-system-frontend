import { computed, reactive, ref } from 'vue'
import type { Product } from '@/types/domain'

export type DiscountType = 'percent' | 'amount'

export interface CartLine {
  productId: number
  nameEn: string
  nameKm?: string
  sku: string
  unitPriceCents: number
  qty: number
  // Per-line discount, independent of the cart-level one below — "discount
  // can discount on product or total" per the request that added this.
  discountType: DiscountType
  discountValue: number
  // A free-text remark ("less sugar", "no ice") — cosmetic only, carried
  // through to the receipt. Adding the same product again just bumps qty on
  // this same line (unchanged merge behavior); the note isn't part of what
  // makes two lines "the same product" — see docs/DECISIONS.md.
  note: string
}

// Module-level singleton (not created fresh per call) — the POS screen's
// product grid, cart panel and payment flow all need to see the same cart.
const lines = reactive<CartLine[]>([])
const cartDiscountType = ref<DiscountType>('amount')
const cartDiscountValue = ref(0)
const customerId = ref<number | null>(null)

function lineGrossCents(line: CartLine) {
  return line.unitPriceCents * line.qty
}
function lineDiscountCents(line: CartLine) {
  const gross = lineGrossCents(line)
  const raw = line.discountType === 'percent' ? Math.round((gross * line.discountValue) / 100) : Math.round(line.discountValue * 100)
  return Math.min(Math.max(raw, 0), gross)
}
function lineNetCents(line: CartLine) {
  return lineGrossCents(line) - lineDiscountCents(line)
}

export function useCart() {
  // The product just picked always lands at the top of the cart, with
  // everything already there shifted down — including when it's already in
  // the cart (its qty goes up and it moves to the top). The +/- steppers on
  // a line (incQty/decQty) deliberately don't reorder: moving a row out from
  // under the cursor while someone is tapping it would be worse than useful.
  function addProduct(product: Pick<Product, 'id' | 'nameEn' | 'nameKm' | 'sku' | 'priceCents'>) {
    const idx = lines.findIndex((l) => l.productId === product.id)
    if (idx !== -1) {
      const [existing] = lines.splice(idx, 1)
      existing.qty += 1
      lines.unshift(existing)
    } else {
      lines.unshift({
        productId: product.id,
        nameEn: product.nameEn,
        nameKm: product.nameKm,
        sku: product.sku,
        unitPriceCents: product.priceCents,
        qty: 1,
        discountType: 'amount',
        discountValue: 0,
        note: '',
      })
    }
  }

  function incQty(productId: number) {
    const line = lines.find((l) => l.productId === productId)
    if (line) line.qty += 1
  }

  function decQty(productId: number) {
    const line = lines.find((l) => l.productId === productId)
    if (!line) return
    line.qty -= 1
    if (line.qty <= 0) removeLine(productId)
  }

  function removeLine(productId: number) {
    const idx = lines.findIndex((l) => l.productId === productId)
    if (idx !== -1) lines.splice(idx, 1)
  }

  function setLineDiscount(productId: number, type: DiscountType, value: number) {
    const line = lines.find((l) => l.productId === productId)
    if (line) {
      line.discountType = type
      line.discountValue = Math.max(0, value)
    }
  }

  function setLineNote(productId: number, note: string) {
    const line = lines.find((l) => l.productId === productId)
    if (line) line.note = note
  }

  function clear() {
    lines.splice(0, lines.length)
    cartDiscountType.value = 'amount'
    cartDiscountValue.value = 0
    customerId.value = null
  }

  const subtotalCents = computed(() => lines.reduce((sum, l) => sum + lineGrossCents(l), 0))
  const lineDiscountsCents = computed(() => lines.reduce((sum, l) => sum + lineDiscountCents(l), 0))
  const afterLineDiscountsCents = computed(() => subtotalCents.value - lineDiscountsCents.value)
  const cartDiscountCents = computed(() => {
    const base = afterLineDiscountsCents.value
    const raw = cartDiscountType.value === 'percent' ? Math.round((base * cartDiscountValue.value) / 100) : Math.round(cartDiscountValue.value * 100)
    return Math.min(Math.max(raw, 0), base)
  })
  // Combined discount (every line's own discount plus the cart-level one) —
  // this is the single number the receipt and shift accounting care about.
  const discountCentsCapped = computed(() => lineDiscountsCents.value + cartDiscountCents.value)
  const totalCents = computed(() => afterLineDiscountsCents.value - cartDiscountCents.value)
  const itemCount = computed(() => lines.reduce((sum, l) => sum + l.qty, 0))

  return {
    lines,
    cartDiscountType,
    cartDiscountValue,
    customerId,
    addProduct,
    incQty,
    decQty,
    removeLine,
    setLineDiscount,
    setLineNote,
    lineGrossCents,
    lineDiscountCents,
    lineNetCents,
    clear,
    subtotalCents,
    // The cart-level part alone: it is what the server takes as the sale's
    // `discount_cents` (line discounts travel on each item).
    cartDiscountCents,
    discountCentsCapped,
    totalCents,
    itemCount,
  }
}
