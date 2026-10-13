'use client'

import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, type ReactNode } from 'react'

import { useConfig } from '@/components/contexts/ConfigContext'
import { vaultTokenInfos } from '@/lib/midnight/ethereum-erc20-vault/vault-token-infos'
import { TokenInfoRegistry } from '@/lib/tokens/token-info-registry'
import { listSupportedTokens } from '@/server/actions/supported-token-actions'

const TokenInfoRegistryContext = createContext<TokenInfoRegistry | null>(null)

/**
 * The vault's allowlist only grows and a reload rereads it, so it is fetched once per page load.
 * Until it answers, the registry holds the bundled tokens with none marked supported.
 */
export function TokenInfoRegistryProvider({ children }: { children: ReactNode }): ReactNode {
  const { ethereum, midnightEthereumErc20Vault, midnightNetwork } = useConfig()
  const supported = useQuery({
    queryKey: [
      'supported-tokens',
      midnightNetwork.networkId,
      midnightEthereumErc20Vault.contractAddress,
    ],
    queryFn: async () => {
      const result = await listSupportedTokens({})
      if (!result.ok) throw new Error(result.error)
      return result.tokens
    },
    staleTime: Infinity,
  })
  const registry = new TokenInfoRegistry(
    vaultTokenInfos(
      midnightEthereumErc20Vault.contractAddress,
      ethereum.chainId,
      supported.data ?? [],
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
