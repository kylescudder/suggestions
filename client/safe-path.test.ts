import { expect, test } from 'bun:test'
import { adminHome, safeAppPath } from '../src/lib/auth/safe-path'

test('sign-in redirects stay on this site', () => {
  expect(safeAppPath('/profile')).toBe('/profile')
  expect(safeAppPath('/?view=admin')).toBe('/?view=admin')
  for (const target of [
    'https://attacker.example/',
    '//attacker.example/',
    '/.//attacker.example/',
    '/./../attacker.example/..//attacker.example/',
    '/%2e//attacker.example/',
    '/\t/attacker.example/',
    '/\n/attacker.example/',
    '/\\attacker.example/',
    'javascript:alert(1)',
    ''
  ])
    expect(safeAppPath(target)).toBe(adminHome)
})
