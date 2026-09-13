"use client";

import { NetworkIcon } from "@web3icons/react";
import { ChevronDown } from "lucide-react";
import type * as React from "react";

import { CryptoIcon } from "@/components/balance-display/crypto-icon";
import { MidnightLogo } from "@/components/midnight-logo";
import { Button } from "@/components/ui/button";
import type { NetworkData, TokenConfig } from "@/lib/constants/token-metadata";
import { cn } from "@/lib/utils";

interface NetworkAccordionItemProps {
  network: NetworkData;
  isExpanded: boolean;
  onNetworkClick: () => void;
  onTokenSelect: (token: TokenConfig, network: NetworkData) => void;
  className?: string;
}

/**
 * Coordinates one network expansion with its selectable token rows.
 *
 * @param properties - Network data, expansion state and selection callbacks.
 * @returns The network accordion item.
 */
export function NetworkAccordionItem(properties: NetworkAccordionItemProps): React.JSX.Element {
  const { network, isExpanded, onNetworkClick, onTokenSelect, className } = properties;
  return (
    <div className={cn("ds-surface-success ds-round overflow-hidden", className)}>
      <Button
        variant="ghost"
        size="row"
        className="w-full"
        aria-expanded={isExpanded}
        onClick={onNetworkClick}
      >
        <div className="ds-row ds-control-gap">
          {network.chain === "midnight" ? (
            <MidnightLogo className="size-7" />
          ) : (
            <NetworkIcon
              name={network.symbol}
              size={28}
              variant="background"
              className="ds-circle shrink-0"
            />
          )}
          <div className="ds-stack">
            <span className="ds-text ds-prose ds-label">{network.chainName}</span>
            <span className="ds-muted ds-body">{network.tokens.length} tokens available</span>
          </div>
        </div>
        <ChevronDown className={cn("ds-muted ds-motion size-4", isExpanded && "rotate-180")} />
      </Button>

      {isExpanded && (
        <div className="ds-inline-inset-content ds-bottom-inset-control">
          <div>
            {network.tokens.map((token, index) => (
              <Button
                variant="ghost"
                size="row"
                key={`${token.erc20Address}-${String(index)}`}
                type="button"
                onClick={() => {
                  onTokenSelect(token, network);
                }}
                className="w-full"
              >
                <CryptoIcon
                  chain={network.chain}
                  token={token.symbol}
                  className="size-6 shrink-0"
                />
                <div className="ds-stack">
                  <span className="ds-text ds-body ds-label">{token.symbol}</span>
                  <span className="ds-muted ds-caption">{token.name}</span>
                </div>
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
