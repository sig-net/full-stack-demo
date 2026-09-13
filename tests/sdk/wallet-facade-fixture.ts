import type { FacadeState } from "@midnightntwrk/wallet-sdk-facade";
import { vi } from "vitest";

import type { MidnightNodeConfig } from "@/lib/config/midnight";
import type * as seedlib from "@/lib/midnight/seedlib";
import type { AccountKeys, WalletFacade } from "@/lib/midnight/seedlib";

/**
 * @param configuration - Validated endpoints retained by the unstarted facade.
 * @param seed - Disposable seed used to derive all three wallet roles.
 * @returns The complete SDK facade, role keys and initial state before network synchronisation.
 */
export async function createWalletFacadeFixture(
  configuration: MidnightNodeConfig,
  seed = "07".repeat(32),
): Promise<{ facade: WalletFacade; keys: AccountKeys; state: FacadeState }> {
  const { deriveAccountKeys, initialiseWalletFacade } =
    await vi.importActual<typeof seedlib>("@/lib/midnight/seedlib");
  const keys = deriveAccountKeys(seed, configuration.networkId);
  const facade = await initialiseWalletFacade(keys, configuration);
  const initial = Promise.withResolvers<FacadeState>();
  const subscription = facade.state().subscribe({
    next: (state) => {
      initial.resolve(state);
    },
    error: (error: Error) => {
      initial.reject(error);
    },
  });
  try {
    return { facade, keys, state: await initial.promise };
  } finally {
    subscription.unsubscribe();
  }
}
