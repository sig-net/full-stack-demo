"use client";

import type * as React from "react";
import { formatUnits } from "viem";

import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/ui/feedback";
import { PublicIdentifier } from "@/components/ui/public-identifier";
import { useAppliedExplorerLinks } from "@/hooks/use-explorer-links";
import { useLocalEthFunding } from "@/hooks/use-local-eth-funding";
import type { VaultGasReserveObservation } from "@/hooks/use-vault-gas-reserves";
import type { ResolvedEvmChainConfig } from "@/lib/config/evm";

interface VaultGasAccountProps {
  heading: string;
  /** The account named inside control labels, written to read naturally mid-sentence. */
  accountName: string;
  purpose: string;
  guidance: string;
  observation: VaultGasReserveObservation;
  network: ResolvedEvmChainConfig | null;
  /** Whether a gate beside a control already states this reserve's reason in the same surface. */
  reasonShownByGate: boolean;
}

/**
 * Presents one MPC-signed paying account: its purpose, network, ETH reserve and funding actions.
 *
 * @param properties - Account description, observed reserve and explorer destination.
 * @param properties.heading - Name of the account this section funds.
 * @param properties.accountName - The account as named inside control labels.
 * @param properties.purpose - What the ETH held here pays for.
 * @param properties.guidance - Funding instruction for the selected network.
 * @param properties.observation - Observed reserve, refresh action and read state.
 * @param properties.network - Applied chain, absent when the EVM configuration is unusable.
 * @param properties.reasonShownByGate - Whether a gate beside a control already carries this
 *   reserve's reason, so the surface states that reason once.
 * @returns The funding section for one paying account.
 */
export function VaultGasAccount(properties: VaultGasAccountProps): React.JSX.Element {
  const { heading, accountName, purpose, guidance, observation, network, reasonShownByGate } =
    properties;
  const explorers = useAppliedExplorerLinks();
  const { reserve, address } = observation;
  const funding = useLocalEthFunding(observation.refresh);
  const symbol = network?.chain.nativeCurrency.symbol ?? "ETH";
  const decimals = network?.chain.nativeCurrency.decimals ?? 18;
  return (
    <div className="ds-stack-control ds-body">
      <p className="ds-label">{heading}</p>
      <p>{purpose}</p>
      {network && <p>Network: {network.chain.name}</p>}
      {address === null || reserve === null ? (
        <p>
          This address is unavailable until the vault identity and EVM configuration resolve it.
        </p>
      ) : (
        <>
          <PublicIdentifier
            value={address}
            label={accountName}
            explorer={explorers.evmAddress(address)}
          />
          <p>
            Balance:{" "}
            {reserve.observed === null
              ? reserve.kind === "unavailable"
                ? "unavailable"
                : "checking"
              : `${formatUnits(reserve.observed, decimals)} ${symbol}`}
          </p>
          <p>
            Estimated reserve: {formatUnits(reserve.required, decimals)} {symbol}
          </p>
          {reserve.shortfall !== null && (
            <p>
              Shortfall: {formatUnits(reserve.shortfall, decimals)} {symbol}
            </p>
          )}
          {observation.checkedAt !== null && (
            <p className="ds-muted">
              Last checked {new Date(observation.checkedAt).toLocaleTimeString()}
            </p>
          )}
          {reserve.kind !== "sufficient" && !reasonShownByGate && (
            <Feedback tone={reserve.tone} role={reserve.tone === "error" ? "alert" : "status"}>
              <p className="ds-label">{reserve.reason}</p>
              <p>{reserve.nextAction}</p>
            </Feedback>
          )}
          <p>{guidance}</p>
          <div className="ds-actions">
            {funding.unavailable === null && (
              <Button
                variant="outline"
                disabled={funding.isFunding(address)}
                onClick={() => {
                  void funding.fund(address);
                }}
              >
                {funding.isFunding(address)
                  ? `Funding the ${accountName}…`
                  : `Fund the ${accountName} with ${symbol}`}
              </Button>
            )}
            <Button
              variant="outline"
              disabled={observation.refreshing}
              onClick={() => {
                void observation.refresh();
              }}
            >
              {observation.refreshing
                ? `Refreshing the ${accountName} balance…`
                : `Refresh the ${accountName} balance`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
