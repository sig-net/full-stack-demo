import { z } from "zod";

import { knownEvmChain } from "./config/evm";
import type { NetworkId } from "./config/midnight";

const explorerOrigin = z.url({ protocol: /^https?$/ });
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const EVM_TRANSACTION_HASH = /^0x[0-9a-fA-F]{64}$/;
const MIDNIGHT_32_BYTE_ID = /^(?:0x)?[0-9a-fA-F]{64}$/;

/** Explorer state of one displayed public identifier, with a reason whenever no route exists. */
export type ExplorerAvailability =
  | { readonly status: "available"; readonly href: string; readonly label: string }
  | { readonly status: "unavailable"; readonly reason: string };

/**
 * Chain identity captured beside an EVM identifier. A receipt keeps the values applied when it was
 * submitted, so later configuration cannot point it at another chain.
 */
export interface EvmExplorerSource {
  readonly explorerUrl: string;
  readonly chainId: bigint | null;
}

const EVM_ROUTES = {
  transaction: { pattern: EVM_TRANSACTION_HASH, segment: "tx", noun: "transaction" },
  address: { pattern: EVM_ADDRESS, segment: "address", noun: "address" },
} as const;
/** EVM identifier kinds with a verified explorer route. */
export type EvmExplorerSubject = keyof typeof EVM_ROUTES;

const MIDNIGHT_ROUTES = {
  transaction: { segment: "transactions", noun: "transaction" },
  contract: { segment: "contracts", noun: "contract" },
} as const;
/** Midnight identifier kinds with a verified explorer route. */
export type MidnightExplorerSubject = keyof typeof MIDNIGHT_ROUTES;

// Midnight Explorer is the explorer the Midnight network documentation names for each network.
// Verified on 2026-09-14: preview, preprod and mainnet serve /transactions/0x<hash> and
// /contracts/0x<address>. No host is published for stagenet and the undeployed network is local,
// so both stay empty and every identifier on them reports that absence.
const MIDNIGHT_EXPLORER_ORIGINS: Readonly<Record<NetworkId, string>> = Object.freeze({
  undeployed: "",
  stagenet: "",
  preview: "https://preview.midnightexplorer.com",
  preprod: "https://preprod.midnightexplorer.com",
  mainnet: "https://midnightexplorer.com",
});

/** Midnight explorers publish blocks, transactions and contracts, and no wallet address route. */
export const MIDNIGHT_ADDRESS_UNSUPPORTED: ExplorerAvailability = Object.freeze({
  status: "unavailable",
  reason:
    "Midnight explorers publish blocks, transactions and contracts only, so a wallet address has no link.",
});

/** A vault request identifier addresses MPC request state, which no explorer publishes. */
export const REQUEST_ID_UNSUPPORTED: ExplorerAvailability = Object.freeze({
  status: "unavailable",
  reason: "A request ID identifies a vault request, not a chain transaction, so it has no link.",
});

/** A secp256k1 public key names a signing authority, which explorers index under no route. */
export const PUBLIC_KEY_UNSUPPORTED: ExplorerAvailability = Object.freeze({
  status: "unavailable",
  reason: "A public key is not a chain record, so no explorer can display it.",
});

function explorerHref(origin: string, segments: readonly string[]): string | null {
  const parsed = explorerOrigin.safeParse(origin);
  if (!parsed.success) return null;
  const url = new URL(parsed.data);
  url.search = "";
  url.hash = "";
  const base = url.pathname.replace(/\/+$/, "");
  url.pathname = `${base}/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
  return url.toString();
}

function evmNetworkName(chainId: bigint | null): string {
  if (chainId === null) return "the configured EVM network";
  return knownEvmChain(chainId)?.name ?? `EVM chain ${chainId.toString()}`;
}

/**
 * @param source - Explorer origin and chain captured with the identifier being displayed.
 * @param subject - Identifier kind selecting its verified route.
 * @param value - The exact public identifier.
 * @returns A safe absolute destination, or the reason this identifier has none.
 */
export function evmExplorerLink(
  source: EvmExplorerSource,
  subject: EvmExplorerSubject,
  value: string,
): ExplorerAvailability {
  const { pattern, segment, noun } = EVM_ROUTES[subject];
  if (!source.explorerUrl)
    return {
      status: "unavailable",
      reason: `No explorer is configured for this network, so this ${noun} has no link.`,
    };
  const network = evmNetworkName(source.chainId);
  if (!pattern.test(value))
    return { status: "unavailable", reason: `This value is not an EVM ${noun} identifier.` };
  const href = explorerHref(source.explorerUrl, [segment, value]);
  return href === null
    ? {
        status: "unavailable",
        reason: "The configured explorer URL is not an absolute HTTP(S) address.",
      }
    : { status: "available", href, label: `View this ${noun} on the ${network} explorer` };
}

/**
 * @param networkId - Midnight network captured with the identifier, or undefined when unrecorded.
 * @param subject - Identifier kind selecting its verified route.
 * @param value - A 32-byte hexadecimal identifier, with or without its 0x prefix.
 * @returns A safe absolute destination, or the reason this identifier has none.
 */
export function midnightExplorerLink(
  networkId: NetworkId | undefined,
  subject: MidnightExplorerSubject,
  value: string,
): ExplorerAvailability {
  const { segment, noun } = MIDNIGHT_ROUTES[subject];
  if (networkId === undefined)
    return {
      status: "unavailable",
      reason: `This record has no captured Midnight network, so its ${noun} has no link.`,
    };
  const origin = MIDNIGHT_EXPLORER_ORIGINS[networkId];
  if (!origin)
    return {
      status: "unavailable",
      reason: `Midnight ${networkId} has no public explorer, so this ${noun} has no link.`,
    };
  if (!MIDNIGHT_32_BYTE_ID.test(value))
    return { status: "unavailable", reason: `This value is not a Midnight ${noun} identifier.` };
  const canonical = `0x${value.replace(/^0x/, "").toLowerCase()}`;
  const href = explorerHref(origin, [segment, canonical]);
  return href === null
    ? { status: "unavailable", reason: `Midnight ${networkId} has no usable explorer origin.` }
    : {
        status: "available",
        href,
        label: `View this ${noun} on the Midnight ${networkId} explorer`,
      };
}
