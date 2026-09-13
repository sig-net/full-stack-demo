import {
  evmAddressAbiWord,
  numericAbiWord,
  pureCircuits,
  SIGNET_DEFAULT_KEY_VERSION,
  toSignBidirectionalEventIndex,
} from "@sig-net/midnight";
import { ledger, VAULT_PATH_BYTES } from "@sig-net/midnight-examples-erc20-vault-contract";
import { expect, it } from "vitest";

import {
  ERC20_TRANSFER_GAS_LIMIT,
  ERC20_TRANSFER_MAX_FEE_PER_GAS,
  ERC20_TRANSFER_MAX_PRIORITY_FEE_PER_GAS,
} from "@/lib/midnight/evm-envelope";
import { APPROVE_SELECTOR, MAX_APPROVE } from "@/lib/midnight/evm-swap";
import {
  BOOLEAN_RESULT_MPC_ROUTING,
  predictCallRequestId,
  predictRequestId,
} from "@/lib/midnight/vault";

import { createVaultCircuitFixture } from "./vault-circuit-fixture";

it("matches the generated deposit request and keeps protocol routing separate from its EVM chain", async () => {
  const fixture = await createVaultCircuitFixture();
  try {
    const before = ledger(fixture.readyState);
    expect(before.initialised).toBe(1n);
    expect(before.evmChainId).toBe(11155111n);
    expect("caip2Id" in before).toBe(false);
    const token = new Uint8Array(20).fill(0xaa);
    const predicted = predictRequestId(
      fixture.binding.environment,
      before,
      fixture.binding.identity.commitment,
      0n,
      token,
      new Uint8Array(20).fill(0xee),
      123n,
    );
    const deposit = await fixture.generatedContract.circuits.startDeposit(
      fixture.context("startDeposit"),
      0n,
      ERC20_TRANSFER_GAS_LIMIT,
      ERC20_TRANSFER_MAX_FEE_PER_GAS,
      ERC20_TRANSFER_MAX_PRIORITY_FEE_PER_GAS,
      SIGNET_DEFAULT_KEY_VERSION,
      { erc20Address: token, amount: 123n },
    );
    const events = toSignBidirectionalEventIndex(
      ledger(deposit.context.callContext.currentQueryContext.state).depositEventMap,
    );
    expect(events.size).toBe(1);
    expect(events.has(predicted)).toBe(true);
    const predictedApproval = predictCallRequestId(
      fixture.binding.environment,
      before,
      VAULT_PATH_BYTES,
      0n,
      token,
      BOOLEAN_RESULT_MPC_ROUTING,
      ERC20_TRANSFER_GAS_LIMIT,
      ERC20_TRANSFER_MAX_FEE_PER_GAS,
      ERC20_TRANSFER_MAX_PRIORITY_FEE_PER_GAS,
      APPROVE_SELECTOR,
      [evmAddressAbiWord(before.uniswapRouter), numericAbiWord(MAX_APPROVE)],
    );
    const approval = await fixture.generatedContract.circuits.approveRouter(
      fixture.context("approveRouter"),
      token,
      0n,
      SIGNET_DEFAULT_KEY_VERSION,
    );
    const approvalEvents = toSignBidirectionalEventIndex(
      ledger(approval.context.callContext.currentQueryContext.state).signBidirectionalEventMap,
    );
    expect(approvalEvents.size).toBe(1);
    expect(approvalEvents.has(predictedApproval)).toBe(true);
    for (const event of [...events.values(), ...approvalEvents.values()]) {
      expect(event.caip2Id).toEqual(pureCircuits.ethereumCaip2Id());
      expect(event.txParams.chainId).toBe(11155111n);
    }
  } finally {
    fixture.binding.providers.privateStateProvider.dispose();
    await fixture.binding.providers.publicDataProvider.dispose();
  }
});
