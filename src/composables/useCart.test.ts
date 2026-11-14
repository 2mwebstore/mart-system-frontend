import { beforeEach, describe, expect, it } from 'vitest'
import type { TaxRate } from '@/types/domain'
import { useCart } from './useCart'

const vat10 = { id: 1, name: 'VAT 10%', percent: 10, active: true } as TaxRate
const vat20 = { id: 2, name: 'VAT 20%', percent: 20, active: true } as TaxRate
const product = (id: number, priceCents: number) => ({ id, nameEn: `P${id}`, nameKm: '', sku: `SKU${id}`, priceCents, imageUrl: '' })

// The cart is shared by the till's pages, so each test starts from an empty
// one with no starting tax.
beforeEach(() => {
  const cart = useCart()
  cart.setCurrency('USD')
  cart.setDefaultTaxRate(null)
  cart.taxRate.value = null
  cart.clear()
})

describe('the cart’s tax', () => {
  it('adds tax on top of what is left after every discount (the server’s sale case)', () => {
    const cart = useCart()
    cart.addProduct(product(1, 500))
    cart.incQty(1)
    cart.setLineDiscount(1, 'amount', 0.5) // −50 on the line
    cart.cartDiscountValue.value = 0.5 // −50 on the cart
    cart.taxRate.value = vat10

    expect(cart.subtotalCents.value).toBe(1000)
    expect(cart.beforeTaxCents.value).toBe(900)
    expect(cart.taxCents.value).toBe(90)
    expect(cart.totalCents.value).toBe(990)
    // The discount the server takes is still the cart part alone, before tax.
    expect(cart.cartDiscountCents.value).toBe(50)
  })

  it('adds nothing with no rate', () => {
    const cart = useCart()
    cart.addProduct(product(1, 1234))
    expect(cart.taxCents.value).toBe(0)
    expect(cart.totalCents.value).toBe(1234)
  })

  it('rounds half up to the cent', () => {
    const cart = useCart()
    cart.addProduct(product(1, 505))
    cart.taxRate.value = vat10
    expect(cart.taxCents.value).toBe(51)
    expect(cart.totalCents.value).toBe(556)
  })

  it('a new sale starts with the starting rate; clearing goes back to it and drops the note', () => {
    const cart = useCart()
    cart.setDefaultTaxRate(vat10)
    expect(cart.taxRate.value).toEqual(vat10)

    cart.addProduct(product(1, 1000))
    cart.taxRate.value = null // No tax for this one
    cart.note.value = '<p>deliver at 5</p>'
    expect(cart.totalCents.value).toBe(1000)

    cart.clear()
    expect(cart.taxRate.value).toEqual(vat10)
    expect(cart.note.value).toBe('')
  })

  it('a changed starting rate reaches an empty cart, not a sale under way', () => {
    const cart = useCart()
    cart.setDefaultTaxRate(vat10)
    cart.setDefaultTaxRate(vat20)
    expect(cart.taxRate.value).toEqual(vat20)

    cart.addProduct(product(1, 1000))
    cart.setDefaultTaxRate(vat10)
    expect(cart.taxRate.value).toEqual(vat20)
    expect(cart.totalCents.value).toBe(1200)
  })

  it('an empty cart the cashier switched keeps the cashier’s pick', () => {
    const cart = useCart()
    cart.setDefaultTaxRate(vat10)
    cart.taxRate.value = null
    cart.setDefaultTaxRate(vat20)
    expect(cart.taxRate.value).toBeNull()
  })
})

describe('a riel company’s cart', () => {
  it('takes amount discounts in whole riel', () => {
    const cart = useCart()
    cart.setCurrency('KHR')
    cart.addProduct(product(1, 15600))
    cart.incQty(1)
    cart.setLineDiscount(1, 'amount', 1000) // −៛1,000 on the line
    cart.cartDiscountValue.value = 500 // −៛500 on the cart
    cart.taxRate.value = vat10

    expect(cart.subtotalCents.value).toBe(31200)
    expect(cart.beforeTaxCents.value).toBe(29700)
    expect(cart.taxCents.value).toBe(2970)
    expect(cart.totalCents.value).toBe(32670)
    expect(cart.cartDiscountCents.value).toBe(500)
  })

  it('takes percent discounts as before', () => {
    const cart = useCart()
    cart.setCurrency('KHR')
    cart.addProduct(product(1, 15600))
    cart.setLineDiscount(1, 'percent', 10)
    expect(cart.beforeTaxCents.value).toBe(14040)
  })
})
