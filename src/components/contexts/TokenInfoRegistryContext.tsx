'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

import { useConfig } from '@/components/contexts/ConfigContext'
import { vaultTokenInfos } from '@/lib/midnight/ethereum-erc20-vault/vault-token-infos'
import { TokenInfoRegistry } from '@/lib/tokens/token-info-registry'

const TokenInfoRegistryContext = createContext<TokenInfoRegistry | null>(null)

/** The configuration a mount receives is fixed, so the token types derived from it are built once. */
export function TokenInfoRegistryProvider({ children }: { children: ReactNode }): ReactNode {
  const { ethereum, midnightEthereumErc20Vault } = useConfig()
  const [registry] = useState(
    () =>
      new TokenInfoRegistry(
        vaultTokenInfos(midnightEthereumErc20Vault.contractAddress, ethereum.chainId),
      ),
  )
  return <TokenInfoRegistryContext value={registry}>{children}</TokenInfoRegistryContext>
}

export function useTokenInfoRegistry(): TokenInfoRegistry {
  const registry = useContext(TokenInfoRegistryContext)
  if (registry === null) {
    throw new Error('useTokenInfoRegistry must be used inside TokenInfoRegistryProvider')
  }
  return registry
}
