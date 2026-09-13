import { addressFromKey, type SignatureVerifyingKey } from "@midnightntwrk/ledger-v9";
import { InMemoryTransactionHistoryStorage } from "@midnightntwrk/wallet-sdk-abstractions";
import { MidnightBech32m, UnshieldedAddress } from "@midnightntwrk/wallet-sdk-address-format";
import { mergeWalletEntries, WalletEntrySchema } from "@midnightntwrk/wallet-sdk-facade";
import { UnshieldedWallet } from "@midnightntwrk/wallet-sdk-unshielded-wallet";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireLocalDemo } from "@/lib/config/local-demo";
import { requireServerConfiguration } from "@/lib/config/server-runtime";
import { LOCAL_NIGHT_GRANT } from "@/lib/wallet-funding";

/** Funding executes with server-side credentials and Node SDK dependencies. */
export const runtime = "nodejs";
/** Eligibility and balances must be evaluated for each request. */
export const dynamic = "force-dynamic";
/** Allows SDK synchronisation and recipient-indexer confirmation within one funding request. */
export const maxDuration = 900;
let running: Promise<undefined | Awaited<ReturnType<typeof fund>>> = Promise.resolve(undefined);

async function fund(
  address: string,
  publicKey: SignatureVerifyingKey,
): Promise<{ hash: string | null; night: string }> {
  const { midnight } = await requireLocalDemo();
  const recipient = MidnightBech32m.parse(address).decode(UnshieldedAddress, midnight.networkId);
  if (addressFromKey(publicKey) !== recipient.hexString)
    throw new Error("The public key does not match the recipient NIGHT address.");
  const observer = UnshieldedWallet({
    networkId: midnight.networkId,
    indexerClientConnection: {
      indexerHttpUrl: midnight.indexerUrl,
      indexerWsUrl: midnight.indexerWsUrl,
    },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema, mergeWalletEntries),
  }).startWithPublicKey({
    publicKey,
    address,
    addressHex: recipient.hexString,
  });
  const readNight = async (): Promise<bigint> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const state = await Promise.race([
        observer.waitForSyncedState(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(new Error("Recipient balance observation timed out. Retry funding."));
          }, 120_000);
        }),
      ]);
      return Object.values(state.balances).reduce((sum, value) => sum + value, 0n);
    } finally {
      clearTimeout(timer);
    }
  };
  const seed = process.env.LOCAL_MIDNIGHT_GENESIS_SEED;
  if (!seed) throw new Error("Run local setup to configure the genesis funding wallet.");
  const { WalletRegistry, assertRootFunded, transferNight } =
    await import("@sig-net/midnight-contract-deploy");
  const wallets = new WalletRegistry(midnight);
  try {
    await observer.start();
    const before = await readNight();
    if (before >= LOCAL_NIGHT_GRANT) return { hash: null, night: before.toString() };
    await requireLocalDemo();
    await assertRootFunded(wallets, seed, undefined);
    const root = await wallets.wallet(seed, "local genesis funding");
    const state = await root.facade.waitForSyncedState();
    await requireLocalDemo();
    const hash = await transferNight(
      root.facade,
      root.keys,
      state,
      address,
      midnight.networkId,
      LOCAL_NIGHT_GRANT - before,
    );
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const night = await readNight();
      if (night >= LOCAL_NIGHT_GRANT) return { hash, night: night.toString() };
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
    throw new Error(
      "NIGHT transfer submitted but the recipient indexer has not caught up. Refresh before retrying.",
    );
  } finally {
    await Promise.allSettled([wallets.close(), observer.stop()]);
  }
}

/**
 * Serialises deficit funding after deployment attestation and local stack verification.
 *
 * @param request - The connected NIGHT address and matching public verifying key.
 * @returns Confirmed funding balances or a validation or eligibility error response.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const input = z
    .object({
      address: z.string().min(10).max(300),
      publicKey: z
        .object({
          tag: z.literal("schnorr"),
          value: z
            .string()
            .regex(/^[0-9a-fA-F]+$/)
            .max(200),
        })
        .strict(),
    })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json(
      {
        error: "Supply the connected Midnight NIGHT address and its public verifying key.",
      },
      { status: 400 },
    );
  try {
    requireServerConfiguration(request);
    await requireLocalDemo();
    const operation = running
      .catch(() => undefined)
      .then(() => fund(input.data.address, input.data.publicKey));
    running = operation;
    return NextResponse.json(await operation);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Local Midnight funding failed.",
      },
      { status: 403 },
    );
  }
}
