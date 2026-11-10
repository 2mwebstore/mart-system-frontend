import { beforeEach, describe, expect, it } from 'vitest'
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from './tokens'

describe('tokens', () => {
  beforeEach(() => localStorage.clear())

  it('starts empty', () => {
    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })

  it('stores and clears both tokens', () => {
    setTokens('a', 'r')
    expect(getAccessToken()).toBe('a')
    expect(getRefreshToken()).toBe('r')
    clearTokens()
    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })
})
