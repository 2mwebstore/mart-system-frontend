import { describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { translateServerMessage } from './apiErrors'
import en from './en.json'
import km from './km.json'

// The messages the server sends for security refusals. Each must be recognised,
// so it reaches a Khmer-speaking user in Khmer.
const messages: Record<string, string> = {
  rateLimited: 'Too many requests. Please wait a moment and try again.',
  payloadTooLarge: 'That request is too large.',
  ownerOnly: 'Only an Owner can change an Owner account or give someone the Owner role.',
  roleAboveYours: "You can't assign or change a role that has permissions you don't hold.",
  discountAboveYours: "You can't set or assign a discount limit higher than your own role's.",
  refundAboveYours: "You can't set or assign a refund limit higher than your own role's.",
  cannotEditOwnRole: "You can't change your own role's permissions.",
  cannotChangeOwnAccess: "You can't change your own role or branches.",
  branchOutOfScope: 'You can only assign branches you have access to.',
  branchRequired: 'Pick at least one branch for this user.',
  userOutOfScope: "That user works at a branch you don't have access to.",
  lastOwner: 'This is the only active Owner. Make someone else an Owner first.',
  tillNotAllowed: "This till belongs to a branch you aren't assigned to.",
  idempotencyConflict: "This sale's reference is already in use. Please try again.",
  backupFailed: "The backup couldn't be completed. Check the server logs.",
  passwordTooLong: 'Password must be at most 72 characters.',
  roleNotValid: 'Role is not valid.',
  roleShared: 'Only an Owner can change a shared role.',
  roleOutOfScope: "That role belongs to a branch you don't have access to.",
  roleBranchRequired: 'Pick the branch this role is for.',
  roleWrongBranch: 'That role belongs to another branch and can only be held there.',
  mainRoleUnused: "The main role has to apply at one of this user's branches at least.",
  ownerRoleGlobal: "The Owner role covers every branch, so it can't be set per branch.",
  branchRoleNotTheirs: "Each per-branch role must be for one of the user's branches.",
  branchRoleTwice: 'Set one role per branch.',
  branchNotValid: 'Branch is not valid.',
  noCompany: "This page is for a company's staff. A super admin manages companies only.",
  notSuperAdmin: 'Only a super admin can do this.',
  unknownCompany: 'No company has that code. Check it with your manager.',
  companyDisabled: 'This company has been disabled.',
  companyCodeTaken: 'Another company already has that code.',
  companyCodeFormat: 'Use 2 to 12 letters and digits.',
  notCompanyOwner: "That isn't one of this company's Owners.",
  categoryNotFound: 'Category not found.',
  supplierNotFound: 'Supplier not found.',
  customerNotFound: 'Customer not found.',
  productNotFound: 'Product not found.',
}

describe('security error messages', () => {
  for (const [key, message] of Object.entries(messages)) {
    it(`${key} has a Khmer translation the server's words map to`, () => {
      expect((en.apiErrors as Record<string, string>)[key]).toBe(message)
      const translated = (km.apiErrors as Record<string, string>)[key]
      expect(translated).toBeTruthy()
      expect(translated).not.toBe(message)

      i18n.global.locale.value = 'km'
      expect(translateServerMessage(message)).toBe(translated)
      i18n.global.locale.value = 'en'
      expect(translateServerMessage(message)).toBe(message)
    })
  }
})

// A company's limits: the server says the number, and so does the translation.
describe('limit messages', () => {
  for (const [key, message] of [
    ['branchLimit', 'This company is at its limit of active branches (5).'],
    ['userLimit', 'This company is at its limit of active user accounts (12).'],
  ] as const) {
    it(`${key} keeps the limit in both languages`, () => {
      const n = message.match(/\((\d+)\)/)![1]
      i18n.global.locale.value = 'km'
      const translated = translateServerMessage(message)
      expect(translated).toBe((km.apiErrors as Record<string, string>)[key].replace('{n}', n))
      expect(translated).not.toBe(message)
      i18n.global.locale.value = 'en'
      expect(translateServerMessage(message)).toBe(message)
      expect((en.apiErrors as Record<string, string>)[key].replace('{n}', n)).toBe(message)
    })
  }
})

describe('translation files', () => {
  it('have the same apiErrors keys', () => {
    expect(Object.keys(km.apiErrors).sort()).toEqual(Object.keys(en.apiErrors).sort())
  })
})
