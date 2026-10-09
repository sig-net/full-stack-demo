import { describe, expect, test } from 'vitest'

import { mock } from '@/lib/testing/mock'

interface Greeter {
  greet(name: string): string
  wave(): void
}

describe('mock', () => {
  test('answers with the supplied method', () => {
    const greeter = mock<Greeter>('Greeter', { greet: (name) => `hello ${name}` })
    expect(greeter.greet('ada')).toBe('hello ada')
  })

  test('fails on a method the test did not supply', () => {
    const greeter = mock<Greeter>('Greeter', { greet: (name) => `hello ${name}` })
    expect(() => greeter.wave()).toThrow('Greeter.wave was called but the test did not expect it')
  })

  test('is safe to return from an async function', async () => {
    const greeter = await Promise.resolve(mock<Greeter>('Greeter'))
    expect(() => greeter.wave()).toThrow('Greeter.wave')
  })
})
