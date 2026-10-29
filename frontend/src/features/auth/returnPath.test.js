import { describe, expect, it } from 'vitest'
import { safeReturnPath } from './returnPath.js'

describe('safe return paths', () => {
  it.each([
    ['https://attacker.example/tickets', '/'],
    ['//attacker.example/tickets', '/'],
    ['/\\attacker.example', '/'],
    ['/api/v1/tickets', '/'],
    ['/sign-in', '/'],
    ['/sign-in/', '/'],
    ['/change-password?from=/tickets', '/'],
    ['/change-password///?from=/tickets', '/'],
  ])('rejects unsafe or looping destination %s', (candidate, expected) => {
    expect(safeReturnPath(candidate)).toBe(expected)
  })

  it('preserves a same-origin application path with search and hash', () => {
    expect(safeReturnPath('/tickets?page=2#latest')).toBe('/tickets?page=2#latest')
  })
})
