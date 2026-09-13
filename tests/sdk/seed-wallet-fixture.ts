import type { FacadeState } from "@midnightntwrk/wallet-sdk-facade";
import { Subject } from "rxjs";
import { type MockInstance, vi } from "vitest";

import { createMidnightChainConfig } from "@/lib/config/midnight";
import * as seedlib from "@/lib/midnight/seedlib";
import { SeedWallet } from "@/lib/midnight/wallet/SeedWallet";

import { createWalletFacadeFixture } from "./wallet-facade-fixture";

/** Controls real SDK construction, startup and state publication independently. */
export interface SeedWalletFixture {
  wallet: SeedWallet;
  facade: seedlib.WalletFacade;
  state: FacadeState;
  construction: PromiseWithResolvers<seedlib.WalletFacade>;
  starting: PromiseWithResolvers<undefined>;
  startEntered: PromiseWithResolvers<undefined>;
  subscribed: PromiseWithResolvers<undefined>;
  states: Subject<FacadeState>;
  stop: MockInstance<seedlib.WalletFacade["stop"]>;
}

/**
 * @param seed - Disposable seed owned by the resulting wallet.
 * @returns A real seed wallet with manually controlled facade lifecycle boundaries.
 */
export async function createSeedWalletFixture(seed = "07".repeat(32)): Promise<SeedWalletFixture> {
  const configuration = createMidnightChainConfig({});
  const { facade, state } = await createWalletFacadeFixture(configuration, seed);
  const construction = Promise.withResolvers<seedlib.WalletFacade>();
  const starting = Promise.withResolvers<undefined>();
  const startEntered = Promise.withResolvers<undefined>();
  const subscribed = Promise.withResolvers<undefined>();
  const states = new Subject<FacadeState>();
  vi.mocked(seedlib.initialiseWalletFacade).mockReturnValueOnce(construction.promise);
  vi.spyOn(facade, "start").mockImplementation(() => {
    startEntered.resolve(undefined);
    return starting.promise;
  });
  const stop = vi.spyOn(facade, "stop");
  vi.spyOn(facade, "state").mockImplementation(() => {
    subscribed.resolve(undefined);
    return states;
  });
  return {
    wallet: new SeedWallet(configuration, seed),
    facade,
    state,
    construction,
    starting,
    startEntered,
    subscribed,
    states,
    stop,
  };
}
