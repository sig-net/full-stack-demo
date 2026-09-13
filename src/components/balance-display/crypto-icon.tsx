"use client";

import { NetworkIcon, TokenIcon } from "@web3icons/react";
import type * as React from "react";

import { MidnightLogo } from "@/components/midnight-logo";
import { cn } from "@/lib/utils";

/**
 * Shows the base token glyph with a chain badge, keeping variant suffixes in the text label.
 *
 * @param properties - Chain, token symbol and optional icon classes.
 * @param properties.chain - Chain identifier for the network badge.
 * @param properties.token - Token symbol used for the base glyph.
 * @param properties.className - Optional icon sizing and layout classes.
 * @returns The token and network icon composition.
 */
export function CryptoIcon(properties: {
  chain: string;
  token: string;
  className?: string;
}): React.JSX.Element {
  const { chain, token, className } = properties;
  // Display symbols may carry a variant suffix to disambiguate same-symbol tokens
  // (USDC.a = Aave Sepolia USDC) or a wrapper prefix (stataUSDC = the ERC-4626 wrapper over
  // Aave USDC). Icon sets only know the base symbol, so reduce to it: the label keeps the
  // full name, the icon shows the underlying asset.
  const iconSymbolCandidate = (token.split(".")[0] ?? token).replace(/^stata/i, "");
  const iconSymbol = iconSymbolCandidate.length > 0 ? iconSymbolCandidate : token;

  const sizeNumber = parseInt(className?.match(/size-(\d+)/)?.[1] ?? "7");

  const tokenSize = sizeNumber * 4; // 4px per size unit
  const networkSize = Math.max(12, sizeNumber * 2); // Minimum 12px, otherwise 2px per size unit

  return (
    <div className={cn("ds-row ds-circle ds-shadow relative justify-center", className)}>
      <TokenIcon symbol={iconSymbol} size={tokenSize} variant="background" className="ds-circle" />

      {chain === "midnight" ? (
        <MidnightLogo
          className={cn("absolute -right-1.5 bottom-0", sizeNumber <= 4 ? "size-3" : "size-4")}
        />
      ) : (
        <NetworkIcon
          name={chain}
          size={networkSize}
          variant="background"
          className={cn(
            "ds-round absolute -right-1.5 bottom-0",
            sizeNumber <= 4 ? "size-3" : "size-4",
          )}
        />
      )}
    </div>
  );
}
