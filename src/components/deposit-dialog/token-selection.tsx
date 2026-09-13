"use client";

import type * as React from "react";
import { useState } from "react";

import type { NetworkData, TokenConfig } from "@/lib/constants/token-metadata";
import { NETWORKS_WITH_TOKENS } from "@/lib/constants/token-metadata";
import { useMidnightConnection } from "@/providers/midnight-wallet-context";
import { useVault } from "@/providers/vault-context";

import { NetworkAccordionItem } from "./network-accordion-item";

interface TokenSelectionProps {
  onTokenSelect: (token: TokenConfig, network: NetworkData) => void;
}

/**
 * Keeps one network expanded while forwarding the chosen token to the deposit flow.
 *
 * @param properties - Token selection callback.
 * @returns The network and token selector.
 */
export function TokenSelection(properties: TokenSelectionProps): React.JSX.Element {
  const { onTokenSelect } = properties;
  const [expandedNetworkId, setExpandedNetworkId] = useState<string | null>(null);
  const vault = useVault();
  const connection = useMidnightConnection();

  const networks = NETWORKS_WITH_TOKENS.filter((network) =>
    network.chain === "midnight" ? !!connection.wallet : !!vault.binding,
  );

  const handleNetworkClick = (networkId: string): void => {
    setExpandedNetworkId(expandedNetworkId === networkId ? null : networkId);
  };

  const handleTokenSelect = (token: TokenConfig, network: NetworkData): void => {
    onTokenSelect(token, network);
    setExpandedNetworkId(null); // Collapse after selection
  };

  return (
    <div className="ds-stack-control">
      <p className="ds-muted ds-body ds-label ds-section-title">Select Network</p>

      {/* Network Accordion List */}
      <div className="ds-stack-control max-h-96 overflow-y-auto">
        {networks.map((network) => {
          const networkId = network.chain;
          const isExpanded = expandedNetworkId === networkId;

          return (
            <NetworkAccordionItem
              key={networkId}
              network={network}
              isExpanded={isExpanded}
              onNetworkClick={() => {
                handleNetworkClick(networkId);
              }}
              onTokenSelect={handleTokenSelect}
            />
          );
        })}
      </div>
    </div>
  );
}
