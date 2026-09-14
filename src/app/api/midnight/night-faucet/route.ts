import { MidnightBech32m, UnshieldedAddress } from "@midnightntwrk/wallet-sdk-address-format";
import { GENESIS_MINT_WALLET_SEED } from "@sig-net/midnight-contract-deploy";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireLocalMidnightFaucetConfiguration } from "@/lib/config/local-faucet-server";
import { LOCAL_NIGHT_GRANT } from "@/lib/wallet-funding";

/** Funding executes with local Node.js SDK dependencies. */
export const runtime = "nodejs";
/** Each funding request submits one local NIGHT transfer. */
export const dynamic = "force-dynamic";
let running: Promise<Response> = Promise.resolve(NextResponse.json({}));

/**
 * Sends the fixed local NIGHT grant to one validated unshielded address.
 *
 * @param request - Body containing the recipient NIGHT address.
 * @returns Submitted transfer hash or a validation error.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const input = z
    .object({ address: z.string().min(10).max(300) })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json(
      { error: "Supply one Midnight NIGHT recipient address." },
      { status: 400 },
    );
  const fund = async (): Promise<Response> => {
    try {
      const configuration = await requireLocalMidnightFaucetConfiguration();
      MidnightBech32m.parse(input.data.address).decode(
        UnshieldedAddress,
        configuration.descriptor.midnight.networkId,
      );
      const { WalletRegistry, assertRootFunded, transferNight } =
        await import("@sig-net/midnight-contract-deploy");
      const wallets = new WalletRegistry(configuration.descriptor.midnight);
      try {
        await assertRootFunded(wallets, GENESIS_MINT_WALLET_SEED, undefined);
        const root = await wallets.wallet(GENESIS_MINT_WALLET_SEED, "local faucet root");
        const state = await root.facade.waitForSyncedState();
        const hash = await transferNight(
          root.facade,
          root.keys,
          state,
          input.data.address,
          configuration.descriptor.midnight.networkId,
          LOCAL_NIGHT_GRANT,
        );
        return NextResponse.json({ hash, night: LOCAL_NIGHT_GRANT.toString() });
      } finally {
        await wallets.close();
      }
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Local NIGHT funding failed." },
        { status: 403 },
      );
    }
  };
  const operation = running.then(fund, fund);
  running = operation;
  return operation;
}
