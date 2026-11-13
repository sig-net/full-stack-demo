import { afterEach, describe, expect, test, vi } from 'vitest'

import { localStorageSlot } from '@/lib/local-storage-slot'

/** A `localStorage` double over a map, or an absent one where `available` is false. */
function storage(available: boolean, entries: Record<string, string> = {}): Map<string, string> {
  const map = new Map(Object.entries(entries))
  vi.stubGlobal(
    'localStorage',
    available
      ? {
          getItem: (key: string) => map.get(key) ?? null,
          setItem: (key: string, value: string) => void map.set(key, value),
          removeItem: (key: string) => void map.delete(key),
        }
      : undefined,
  )
  return map
}

afterEach(() => {
  vi.unstubAllGlobals()
})

interface SlotCase {
  readonly name: string
  readonly available: boolean
  readonly entries: Record<string, string>
  readonly act: () => string | null | void
  readonly expected: string | null | undefined
  readonly after: Record<string, string>
}

const slotCases: readonly SlotCase[] = [
  {
    name: 'reads the stored value',
    available: true,
    entries: { secret: 'abc', other: 'xyz' },
    act: () => localStorageSlot('secret').read(),
    expected: 'abc',
    after: { secret: 'abc', other: 'xyz' },
  },
  {
    name: 'reads null when nothing is stored under the key',
    available: true,
    entries: { other: 'xyz' },
    act: () => localStorageSlot('secret').read(),
    expected: null,
    after: { other: 'xyz' },
  },
  {
    name: 'reads null where storage is unavailable',
    available: false,
    entries: {},
    act: () => localStorageSlot('secret').read(),
    expected: null,
    after: {},
  },
  {
    name: 'writes under its own key only',
    available: true,
    entries: { other: 'xyz' },
    act: () => localStorageSlot('secret').write('abc'),
    expected: undefined,
    after: { secret: 'abc', other: 'xyz' },
  },
  {
    name: 'drops a write where storage is unavailable',
    available: false,
    entries: {},
    act: () => localStorageSlot('secret').write('abc'),
    expected: undefined,
    after: {},
  },
  {
    name: 'clears its own key only',
    available: true,
    entries: { secret: 'abc', other: 'xyz' },
    act: () => localStorageSlot('secret').clear(),
    expected: undefined,
    after: { other: 'xyz' },
  },
  {
    name: 'clears nothing where storage is unavailable',
    available: false,
    entries: {},
    act: () => localStorageSlot('secret').clear(),
    expected: undefined,
    after: {},
  },
]

describe('localStorageSlot', () => {
  test.each(slotCases)('$name', ({ available, entries, act, expected, after }) => {
    const map = storage(available, entries)
    expect(act()).toBe(expected)
    expect(Object.fromEntries(map)).toEqual(after)
  })

  test.each([
    { name: 'notifies on a change to its key', eventKey: 'secret', notified: true },
    { name: 'notifies when the whole store is cleared', eventKey: null, notified: true },
    { name: 'ignores a change to another key', eventKey: 'other', notified: false },
  ])('$name', ({ eventKey, notified }) => {
    const listeners = new Set<(event: { key: string | null }) => void>()
    vi.stubGlobal('window', {
      addEventListener: (_type: string, listener: (event: { key: string | null }) => void) =>
        void listeners.add(listener),
      removeEventListener: (_type: string, listener: (event: { key: string | null }) => void) =>
        void listeners.delete(listener),
    })
    const calls: number[] = []
    const unsubscribe = localStorageSlot('secret').subscribe(() => calls.push(1))
    expect(listeners.size).toBe(1)
    for (const listener of listeners) listener({ key: eventKey })
    expect(calls.length).toBe(notified ? 1 : 0)
    unsubscribe()
    expect(listeners.size).toBe(0)
  })

  test.each([
    {
      name: 'its own write',
      act: (slot: ReturnType<typeof localStorageSlot>) => slot.write('abc'),
    },
    { name: 'its own clear', act: (slot: ReturnType<typeof localStorageSlot>) => slot.clear() },
  ])(
    'notifies the subscriber of $name in the same page, and not after unsubscribing',
    ({ act }) => {
      storage(true, { secret: 'old' })
      vi.stubGlobal('window', {
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })
      const slot = localStorageSlot('secret')
      const calls: number[] = []
      const unsubscribe = slot.subscribe(() => calls.push(1))
      act(slot)
      expect(calls.length).toBe(1)
      unsubscribe()
      act(slot)
      expect(calls.length).toBe(1)
    },
  )
})
