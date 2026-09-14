import { ContractState } from "@midnight-ntwrk/compact-runtime";
import { bytesToHex } from "@sig-net/midnight";
import { expect, it, vi } from "vitest";

import { MPC_OPERATION_ETH_RESERVE } from "@/lib/midnight/evm-envelope";
import { readPendingDeposits, runDeposit } from "@/lib/midnight/vault";

import { startRpcStub } from "../evm/rpc-stub";
import { createPendingDeposit, createVaultCircuitFixture } from "./vault-circuit-fixture";

const REQUIRED = MPC_OPERATION_ETH_RESERVE.deposit;
const AMOUNT = 3_000_000n;
const TOKEN = new Uint8Array(20).fill(9);
const TOKEN_ADDRESS = `0x${bytesToHex(TOKEN)}`;
const START_REACHED = "startDeposit reached";

it.each([
  ["an empty deposit address", 0n, "holds no ETH"],
  ["one wei below the reserve", REQUIRED - 1n, "below the reserve"],
] as const)("rejects a new deposit request from %s", async (_case, wei, expected) => {
  const fixture = await createVaultCircuitFixture();
  const stub = await startRpcStub(11155111n);
  const state = new ContractState();
  state.data = fixture.readyState;
  vi.spyOn(fixture.binding.providers.publicDataProvider, "queryContractState").mockResolvedValue(
    state,
  );
  const start = vi.spyOn(fixture.binding.contract.callTx, "startDeposit");
  stub.setBalance(wei);
  try {
    await expect(
      runDeposit(
        { set: vi.fn() },
        fixture.binding.providers,
        fixture.binding.contract,
        { ...fixture.binding.environment, evmRpcUrl: stub.url },
        fixture.binding.identity,
        TOKEN_ADDRESS,
        AMOUNT,
        vi.fn(),
      ),
    ).rejects.toThrow(expected);
    expect(start).not.toHaveBeenCalled();
    expect(stub.requested).toContain(fixture.binding.depositAddress.toLowerCase());
  } finally {
    await stub.close();
    fixture.binding.providers.privateStateProvider.dispose();
    await fixture.binding.providers.publicDataProvider.dispose();
  }
});

it("rejects a new deposit request when the deposit address balance cannot be read", async () => {
  const fixture = await createVaultCircuitFixture();
  const stub = await startRpcStub(11155111n);
  const state = new ContractState();
  state.data = fixture.readyState;
  vi.spyOn(fixture.binding.providers.publicDataProvider, "queryContractState").mockResolvedValue(
    state,
  );
  const start = vi.spyOn(fixture.binding.contract.callTx, "startDeposit");
  stub.failBalance();
  try {
    await expect(
      runDeposit(
        { set: vi.fn() },
        fixture.binding.providers,
        fixture.binding.contract,
        { ...fixture.binding.environment, evmRpcUrl: stub.url },
        fixture.binding.identity,
        TOKEN_ADDRESS,
        AMOUNT,
        vi.fn(),
      ),
    ).rejects.toThrow("could not be read");
    expect(start).not.toHaveBeenCalled();
  } finally {
    await stub.close();
    fixture.binding.providers.privateStateProvider.dispose();
    await fixture.binding.providers.publicDataProvider.dispose();
  }
});

it("submits a new deposit request once the deposit address holds exactly the reserve", async () => {
  const fixture = await createVaultCircuitFixture();
  const stub = await startRpcStub(11155111n);
  const state = new ContractState();
  state.data = fixture.readyState;
  vi.spyOn(fixture.binding.providers.publicDataProvider, "queryContractState").mockResolvedValue(
    state,
  );
  const start = vi
    .spyOn(fixture.binding.contract.callTx, "startDeposit")
    .mockRejectedValue(new Error(START_REACHED));
  stub.setBalance(REQUIRED);
  stub.setNonce(7n);
  const phases: string[] = [];
  try {
    await expect(
      runDeposit(
        {
          set: (phase) => {
            phases.push(phase);
          },
        },
        fixture.binding.providers,
        fixture.binding.contract,
        { ...fixture.binding.environment, evmRpcUrl: stub.url },
        fixture.binding.identity,
        TOKEN_ADDRESS,
        AMOUNT,
        vi.fn(),
      ),
    ).rejects.toThrow(START_REACHED);
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0]?.[0]).toBe(7n);
    expect(start.mock.calls[0]?.[5]).toEqual({ erc20Address: TOKEN, amount: AMOUNT });
    expect(phases).toEqual(["proving"]);
  } finally {
    await stub.close();
    fixture.binding.providers.privateStateProvider.dispose();
    await fixture.binding.providers.publicDataProvider.dispose();
  }
});

it("refuses a second request beside a pending one of a different amount", async () => {
  const fixture = await createVaultCircuitFixture();
  const stub = await startRpcStub(11155111n);
  const pending = await createPendingDeposit(fixture, TOKEN, AMOUNT);
  const state = new ContractState();
  state.data = pending.pendingState;
  vi.spyOn(fixture.binding.providers.publicDataProvider, "queryContractState").mockResolvedValue(
    state,
  );
  const start = vi.spyOn(fixture.binding.contract.callTx, "startDeposit");
  stub.setBalance(REQUIRED * 1000n);
  try {
    expect(
      await readPendingDeposits(
        fixture.binding.providers,
        { ...fixture.binding.environment, evmRpcUrl: stub.url },
        fixture.binding.identity,
        TOKEN_ADDRESS,
      ),
    ).toEqual([{ requestId: pending.requestId, units: AMOUNT }]);
    await expect(
      runDeposit(
        { set: vi.fn() },
        fixture.binding.providers,
        fixture.binding.contract,
        { ...fixture.binding.environment, evmRpcUrl: stub.url },
        fixture.binding.identity,
        TOKEN_ADDRESS,
        AMOUNT + 1n,
        vi.fn(),
      ),
    ).rejects.toThrow(`Pending deposit 0x${pending.requestId} already claims the next sweep`);
    expect(start).not.toHaveBeenCalled();
    expect(stub.requested).toEqual([]);
  } finally {
    await stub.close();
    fixture.binding.providers.privateStateProvider.dispose();
    await fixture.binding.providers.publicDataProvider.dispose();
  }
});
