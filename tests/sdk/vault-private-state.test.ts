import {
  PrivateStateExportError,
  PrivateStateImportError,
  SigningKeyExportError,
} from "@midnight-ntwrk/midnight-js/types";
import { signingKeyFromBip340 } from "@midnightntwrk/ledger-v9";
import {
  createVaultPrivateState,
  VAULT_PRIVATE_STATE_ID,
} from "@sig-net/midnight-examples-erc20-vault-contract";
import { expect, it } from "vitest";

import { createVaultPrivateStateProvider } from "@/lib/midnight/vault-private-state";

it("copies secrets, scopes records by contract and clears every scope", async () => {
  const provider = createVaultPrivateStateProvider();
  const state = createVaultPrivateState(new Uint8Array(32).fill(6));
  await expect(provider.get(VAULT_PRIVATE_STATE_ID)).rejects.toThrow("address first");
  provider.setContractAddress("a");
  const write = provider.set(VAULT_PRIVATE_STATE_ID, state);
  state.secretKey[0] = 9;
  await write;
  expect((await provider.get(VAULT_PRIVATE_STATE_ID))?.secretKey[0]).toBe(6);
  const read = await provider.get(VAULT_PRIVATE_STATE_ID);
  expect(read).not.toBeNull();
  if (!read) throw new Error("Expected stored state");
  read.secretKey[0] = 7;
  expect((await provider.get(VAULT_PRIVATE_STATE_ID))?.secretKey[0]).toBe(6);
  provider.setContractAddress("b");
  expect(await provider.get(VAULT_PRIVATE_STATE_ID)).toBeNull();
  await provider.set(VAULT_PRIVATE_STATE_ID, state);
  await provider.remove(VAULT_PRIVATE_STATE_ID);
  expect(await provider.get(VAULT_PRIVATE_STATE_ID)).toBeNull();
  await provider.set(VAULT_PRIVATE_STATE_ID, state);
  provider.setContractAddress("a");
  expect(await provider.get(VAULT_PRIVATE_STATE_ID)).not.toBeNull();
  await provider.clear();
  expect(await provider.get(VAULT_PRIVATE_STATE_ID)).toBeNull();
  provider.setContractAddress("b");
  expect(await provider.get(VAULT_PRIVATE_STATE_ID)).toBeNull();
  provider.dispose();
});

it("owns signing-key removal and makes disposal irreversible", async () => {
  const provider = createVaultPrivateStateProvider();
  const key = signingKeyFromBip340(new Uint8Array(32).fill(1));
  await provider.setSigningKey("a", key);
  expect(await provider.getSigningKey("a")).toBe(key);
  expect(await provider.getSigningKey("b")).toBeNull();
  await provider.removeSigningKey("a");
  expect(await provider.getSigningKey("a")).toBeNull();
  await provider.setSigningKey("a", key);
  await provider.clearSigningKeys();
  expect(await provider.getSigningKey("a")).toBeNull();
  provider.setContractAddress("a");
  await provider.set(VAULT_PRIVATE_STATE_ID, createVaultPrivateState(new Uint8Array(32)));
  await provider.setSigningKey("a", key);
  provider.dispose();
  provider.dispose();
  await expect(
    provider.set(VAULT_PRIVATE_STATE_ID, createVaultPrivateState(new Uint8Array(32))),
  ).rejects.toThrow("disposed");
  await expect(provider.get(VAULT_PRIVATE_STATE_ID)).rejects.toThrow("disposed");
  await expect(provider.getSigningKey("a")).rejects.toThrow("disposed");
  await expect(provider.setSigningKey("a", key)).rejects.toThrow("disposed");
  expect(() => {
    provider.setContractAddress("a");
  }).toThrow("disposed");
});

it("rejects all four SDK backup capabilities with explicit compatibility error categories", async () => {
  const provider = createVaultPrivateStateProvider();
  const payload = { encryptedPayload: "fixture", salt: "00".repeat(32) };
  await expect(provider.exportPrivateStates()).rejects.toThrow(PrivateStateExportError);
  await expect(
    provider.importPrivateStates({ ...payload, format: "midnight-private-state-export" }),
  ).rejects.toThrow(PrivateStateImportError);
  await expect(provider.exportSigningKeys()).rejects.toThrow(SigningKeyExportError);
  await expect(
    provider.importSigningKeys({ ...payload, format: "midnight-signing-key-export" }),
  ).rejects.toThrow(PrivateStateImportError);
  await expect(provider.exportPrivateStates()).rejects.toThrow("copy and paste");
  provider.dispose();
});
