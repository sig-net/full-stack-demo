"use client";

import { NetworkIcon } from "@web3icons/react";
import { Info, Loader2 } from "lucide-react";
import type * as React from "react";
import type { ReactElement } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PublicIdentifier } from "@/components/ui/public-identifier";
import { QRCode } from "@/components/ui/qr-code";
import type { NetworkData, TokenConfig } from "@/lib/constants/token-metadata";

interface DepositAddressProps {
  token: TokenConfig;
  network: NetworkData;
  depositAddress: string;
  isSubmitting: boolean;
  showContinue?: boolean;
  canContinue: boolean;
  onContinue: () => void;
}

/**
 * Presents the deposit address, QR code, copy action and optional continuation.
 *
 * @param properties - Address data and continuation controls.
 * @returns The deposit address surface.
 */
export function DepositAddress(properties: DepositAddressProps): React.JSX.Element {
  const {
    token,
    network,
    depositAddress,
    isSubmitting,
    showContinue = true,
    canContinue,
    onContinue,
  } = properties;
  // The QR helper takes a file asset via iconUrl (it only serializes SVG elements).
  const qrIconProps: { iconUrl: string } | { icon: ReactElement } =
    network.chain === "midnight"
      ? { iconUrl: "/midnight/logomark.svg" }
      : { icon: <NetworkIcon name={network.chain} /> };

  return (
    <div className="ds-surface ds-stack-content w-full">
      <p className="ds-muted ds-label capitalize">{network.chainName} Address</p>

      <div className="ds-page ds-stack ds-content-gap ds-round ds-frame ds-inset-content justify-center">
        <QRCode
          value={depositAddress}
          size={200}
          {...qrIconProps}
          className="ds-surface mx-auto sm:hidden"
          errorCorrectionLevel="M"
          margin={12}
        />
        <QRCode
          value={depositAddress}
          size={242}
          {...qrIconProps}
          className="ds-surface mx-auto hidden sm:block"
          errorCorrectionLevel="M"
          margin={16}
        />

        <PublicIdentifier value={depositAddress} label="deposit address" className="mx-auto" />
      </div>

      <div className="ds-row ds-control-gap justify-center">
        <p className="ds-muted ds-body text-center">Use this address to deposit {token.name}</p>
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="About deposit address">
              <Info className="ds-muted h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top">
            <p className="ds-caption ds-label ds-text ds-after-control">
              How to get {token.name} on testnet
            </p>
            <p className="ds-caption ds-muted">
              {token.acquireHint ?? `Get testnet ${token.symbol} from a faucet.`}
            </p>
            {token.faucetUrl && (
              <a
                href={token.faucetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ds-caption ds-link ds-before-control inline-block"
              >
                Get {token.symbol} here
              </a>
            )}
            <div className="ds-round ds-surface-muted ds-before-control ds-inline-inset-control ds-block-inset-control">
              <p className="ds-caption ds-muted">Contract Address</p>
              <PublicIdentifier value={token.erc20Address} label="Token contract address" />
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {showContinue && (
        <div className="flex w-full justify-center">
          <Button
            onClick={onContinue}
            variant="secondary"
            disabled={isSubmitting || !canContinue}
            className="w-full"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="ds-spinner h-4 w-4" />
                Notifying...
              </>
            ) : (
              "I've sent the tokens"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
