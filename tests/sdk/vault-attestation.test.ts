import { ContractState } from "@midnight-ntwrk/compact-runtime";
import {
  MPC_FAILURE_OUTPUT,
  requestIdBytes,
  requestIdHex,
  serializeRespondOutput,
  SignetRequestResponseReader,
  verifyRespondBidirectionalSignature,
} from "@sig-net/midnight";
import {
  calculateSignetAttestationDigest,
  ecdsaSignatureToMpcSignature,
  secp256k1PublicKeyOf,
  signAttestationDigest,
} from "@sig-net/midnight/testing";
import { expect, it, vi } from "vitest";

import * as observation from "@/lib/midnight/observed-execution";
import { fetchAttestedRespondOutcome } from "@/lib/midnight/vault";

import { createVaultCircuitFixture } from "./vault-circuit-fixture";

vi.mock(import("@/lib/midnight/observed-execution"), { spy: true });

it("accepts only the observed output or fixed failure attested by the actual vault response key", async () => {
  const fixture = await createVaultCircuitFixture();
  const requestId = requestIdHex(new Uint8Array(32).fill(0xab));
  const schema = '[{"name":"success","type":"bool"}]';
  const success = serializeRespondOutput(schema, { success: true });
  const post = (
    output: Uint8Array,
  ): Awaited<ReturnType<SignetRequestResponseReader["getRespondBidirectionalEvents"]>>[number] => ({
    signature: ecdsaSignatureToMpcSignature(
      signAttestationDigest(
        calculateSignetAttestationDigest(requestIdBytes(requestId), output),
        fixture.responseSecret,
      ),
    ),
  });
  let events = [post(success)];
  const state = new ContractState();
  state.data = fixture.readyState;
  vi.spyOn(fixture.binding.providers.publicDataProvider, "queryContractState").mockResolvedValue(
    state,
  );
  vi.spyOn(
    SignetRequestResponseReader.prototype,
    "getRespondBidirectionalEvents",
  ).mockImplementation(() => Promise.resolve(events));
  const verified = vi
    .spyOn(SignetRequestResponseReader.prototype, "getVerifiedRespondBidirectionalEvent")
    .mockImplementation((id, output, key) => {
      expect(key).toEqual(secp256k1PublicKeyOf(fixture.responseSecret));
      return Promise.resolve(
        events.find((event) =>
          verifyRespondBidirectionalSignature(requestIdBytes(id), output, event, key),
        ),
      );
    });
  const observed = vi
    .mocked(observation.observeExecution)
    .mockResolvedValue({ success: true, output: `0x${"00".repeat(31)}01` });
  const outcome = (): ReturnType<typeof fetchAttestedRespondOutcome> =>
    fetchAttestedRespondOutcome(fixture.binding.providers, fixture.binding.environment, requestId);
  try {
    expect((await outcome())?.succeeded).toBe(true);
    observed.mockResolvedValue({ success: true, output: `0x${"00".repeat(32)}` });
    expect(await outcome()).toBeUndefined();
    events = [post(MPC_FAILURE_OUTPUT)];
    expect((await outcome())?.matchedFailureOutput).toBe(true);
    observed.mockResolvedValue({ success: false, output: null });
    expect((await outcome())?.matchedFailureOutput).toBe(true);
    events = [post(success)];
    expect(await outcome()).toBeUndefined();
    events = [];
    const calls = verified.mock.calls.length;
    expect(await outcome()).toBeUndefined();
    expect(verified).toHaveBeenCalledTimes(calls);
  } finally {
    fixture.binding.providers.privateStateProvider.dispose();
    await fixture.binding.providers.publicDataProvider.dispose();
  }
});
