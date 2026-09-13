import { createWitnessContext } from "@midnight-ntwrk/compact-runtime";
import {
  createVaultPrivateState,
  ledger,
  pureCircuits,
  witnesses,
} from "@sig-net/midnight-examples-erc20-vault-contract";
import { afterEach, expect, it, vi } from "vitest";

import { depositAddress, deriveIdentity } from "@/lib/midnight/vault";

import { createVaultCircuitFixture } from "./vault-circuit-fixture";

afterEach(() => {
  vi.restoreAllMocks();
});

it("derives stable identity commitments and deployment-compatible deposit addresses", async () => {
  const fixture = await createVaultCircuitFixture();
  try {
    const secret = new Uint8Array(32).fill(7);
    const same = deriveIdentity(secret.slice());
    const repeat = deriveIdentity(secret.slice());
    const other = deriveIdentity(new Uint8Array(32).fill(8));

    expect(same.commitment).toHaveLength(32);
    expect(Buffer.from(same.commitment)).toEqual(Buffer.from(repeat.commitment));
    expect(depositAddress(fixture.binding.environment, same)).toBe(
      depositAddress(fixture.binding.environment, repeat),
    );
    expect(depositAddress(fixture.binding.environment, same)).not.toBe(
      depositAddress(fixture.binding.environment, other),
    );

    const privateState = createVaultPrivateState(same.secretKey);
    const witnessContext = createWitnessContext(
      ledger(fixture.readyState),
      privateState,
      fixture.binding.environment.contractAddress,
    );
    const witnessed = witnesses.callerSecretKey(witnessContext);
    expect(witnessed[1]).toEqual(same.secretKey);
    expect(Buffer.from(pureCircuits.userCommitment(witnessed[1]))).toEqual(
      Buffer.from(same.commitment),
    );
  } finally {
    fixture.binding.providers.privateStateProvider.dispose();
    await fixture.binding.providers.publicDataProvider.dispose();
    await fixture.binding.wallet.disconnect();
  }
});
