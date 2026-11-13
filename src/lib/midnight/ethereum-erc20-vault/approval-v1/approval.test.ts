import { describe, expect, test } from 'vitest'

import {
  type ApprovalTarget,
  routerAllowanceOf,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval'

const USDC = `0x${'1c'.repeat(20)}`
const EURC = `0x${'08'.repeat(20)}`
const ROUTER = `0x${'3b'.repeat(20)}`
const STATA = `0x${'7e'.repeat(20)}`

const targets: ApprovalTarget[] = [
  { kind: 'router', erc20Address: USDC, spender: ROUTER, allowance: 0n },
  { kind: 'router', erc20Address: EURC, spender: ROUTER, allowance: 5n },
  { kind: 'stata', erc20Address: USDC, spender: STATA, allowance: 9n },
]

describe('routerAllowanceOf', () => {
  test.each([
    { name: 'the router entry of the token, zero included', erc20Address: USDC, expected: 0n },
    {
      name: 'the token in another letter case',
      erc20Address: EURC.toUpperCase().replace('0X', '0x'),
      expected: 5n,
    },
    { name: 'a token with no router entry', erc20Address: `0x${'aa'.repeat(20)}`, expected: null },
  ])('answers $name', ({ erc20Address, expected }) => {
    expect(routerAllowanceOf(targets, erc20Address)).toBe(expected)
  })

  test('is null while the targets are unread', () => {
    expect(routerAllowanceOf(undefined, USDC)).toBeNull()
  })
})
