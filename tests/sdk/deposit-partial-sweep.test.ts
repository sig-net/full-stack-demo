import {
  bytesToHex,
  evmAddressAbiWord,
  numericAbiWord,
  requestIdBytes,
  SIGNET_DEFAULT_KEY_VERSION,
  toSignBidirectionalEventIndex,
} from "@sig-net/midnight";
import { ledger } from "@sig-net/midnight-examples-erc20-vault-contract";
import { expect, it } from "vitest";

import {
  ERC20_TRANSFER_GAS_LIMIT,
  ERC20_TRANSFER_MAX_FEE_PER_GAS,
  ERC20_TRANSFER_MAX_PRIORITY_FEE_PER_GAS,
} from "@/lib/midnight/evm-envelope";

import { createVaultCircuitFixture } from "./vault-circuit-fixture";

const HELD_UNITS = 10_000_000n;
const SWEPT_UNITS = 3_000_000n;
const REMAINING_UNITS = HELD_UNITS - SWEPT_UNITS;

it("signs a sweep for exactly the requested amount and records it as the mintable quantity", async () => {
  const fixture = await createVaultCircuitFixture();
  try {
    const before = ledger(fixture.readyState);
    const token = new Uint8Array(20).fill(0xaa);
    const partial = await fixture.generatedContract.circuits.startDeposit(
      fixture.context("startDeposit"),
      0n,
      ERC20_TRANSFER_GAS_LIMIT,
      ERC20_TRANSFER_MAX_FEE_PER_GAS,
      ERC20_TRANSFER_MAX_PRIORITY_FEE_PER_GAS,
      SIGNET_DEFAULT_KEY_VERSION,
      { erc20Address: token, amount: SWEPT_UNITS },
    );
    const partialState = partial.context.callContext.currentQueryContext.state;
    const partialLedger = ledger(partialState);
    const events = [...toSignBidirectionalEventIndex(partialLedger.depositEventMap)];
    expect(events).toHaveLength(1);
    const [requestId, event] = events[0] ?? [];
    if (!requestId || !event) throw new Error("Expected one generated deposit request");
    expect(event.txParams.calldata.is_some).toBe(true);
    expect(event.txParams.calldata.value.words.map((word) => bytesToHex(word))).toEqual([
      bytesToHex(evmAddressAbiWord(before.vaultEvmAddress)),
      bytesToHex(numericAbiWord(SWEPT_UNITS)),
    ]);
    expect(partialLedger.depositSettleViews.lookup(requestIdBytes(requestId)).amount).toBe(
      SWEPT_UNITS,
    );
  } finally {
    fixture.binding.providers.privateStateProvider.dispose();
    await fixture.binding.providers.publicDataProvider.dispose();
  }
});

it("admits a second pending request on the same deposit account and EVM nonce", async () => {
  const fixture = await createVaultCircuitFixture();
  try {
    const token = new Uint8Array(20).fill(0xaa);
    const first = await fixture.generatedContract.circuits.startDeposit(
      fixture.context("startDeposit"),
      0n,
      ERC20_TRANSFER_GAS_LIMIT,
      ERC20_TRANSFER_MAX_FEE_PER_GAS,
      ERC20_TRANSFER_MAX_PRIORITY_FEE_PER_GAS,
      SIGNET_DEFAULT_KEY_VERSION,
      { erc20Address: token, amount: SWEPT_UNITS },
    );
    const second = await fixture.generatedContract.circuits.startDeposit(
      fixture.context("startDeposit", first.context.callContext.currentQueryContext.state),
      0n,
      ERC20_TRANSFER_GAS_LIMIT,
      ERC20_TRANSFER_MAX_FEE_PER_GAS,
      ERC20_TRANSFER_MAX_PRIORITY_FEE_PER_GAS,
      SIGNET_DEFAULT_KEY_VERSION,
      { erc20Address: token, amount: REMAINING_UNITS },
    );
    const state = ledger(second.context.callContext.currentQueryContext.state);
    const events = [...toSignBidirectionalEventIndex(state.depositEventMap)];
    expect(events).toHaveLength(2);
    expect(events.map(([, event]) => event.txParams.nonce)).toEqual([0n, 0n]);
    const views = [...state.depositSettleViews]
      .map(([, view]) => view.amount)
      .sort((a, b) => Number(a - b));
    expect(views).toEqual([SWEPT_UNITS, REMAINING_UNITS].sort((a, b) => Number(a - b)));
  } finally {
    fixture.binding.providers.privateStateProvider.dispose();
    await fixture.binding.providers.publicDataProvider.dispose();
  }
});
