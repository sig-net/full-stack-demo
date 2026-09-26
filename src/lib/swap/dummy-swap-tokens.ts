export const dummySwapTokens = ['SOL', 'ETH', 'BTC'] as const

export type DummySwapToken = (typeof dummySwapTokens)[number]
