import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import { expect, it, vi } from "vitest";

import type { WalletAddressSnapshot } from "@/lib/midnight/wallet/Wallet";

import {
  createBrowserWalletAddresses,
  createBrowserWalletFixture,
} from "./midnight-browser-wallet-fixture";

it("publishes immutable cumulative addresses while other connector reads are pending", async () => {
  const fixture = createBrowserWalletFixture();
  const shielded =
    Promise.withResolvers<Awaited<ReturnType<ConnectedAPI["getShieldedAddresses"]>>>();
  const unshielded =
    Promise.withResolvers<Awaited<ReturnType<ConnectedAPI["getUnshieldedAddress"]>>>();
  const dust = Promise.withResolvers<Awaited<ReturnType<ConnectedAPI["getDustAddress"]>>>();
  fixture.api.getShieldedAddresses.mockReturnValue(shielded.promise);
  fixture.api.getUnshieldedAddress.mockReturnValue(unshielded.promise);
  fixture.api.getDustAddress.mockReturnValue(dust.promise);
  const snapshots: WalletAddressSnapshot[] = [];
  const connection = fixture.wallet.connect((snapshot) => {
    snapshots.push(snapshot);
  });

  await vi.waitFor(() => {
    expect(fixture.api.getShieldedAddresses).toHaveBeenCalledTimes(1);
    expect(fixture.api.getUnshieldedAddress).toHaveBeenCalledTimes(1);
    expect(fixture.api.getDustAddress).toHaveBeenCalledTimes(1);
  });
  unshielded.resolve(fixture.addresses.unshielded);
  await vi.waitFor(() => {
    expect(snapshots).toHaveLength(1);
  });
  expect(snapshots[0]).toStrictEqual({
    networkId: fixture.configuration.networkId,
    unshieldedAddress: fixture.addresses.unshielded.unshieldedAddress,
  });
  expect(Object.isFrozen(snapshots[0])).toBe(true);

  dust.resolve(fixture.addresses.dust);
  await vi.waitFor(() => {
    expect(snapshots).toHaveLength(2);
  });
  shielded.resolve(fixture.addresses.shielded);
  await connection;

  expect(snapshots[2]).toStrictEqual({
    dustAddress: fixture.addresses.dust.dustAddress,
    networkId: fixture.configuration.networkId,
    shieldedAddress: fixture.addresses.shielded.shieldedAddress,
    unshieldedAddress: fixture.addresses.unshielded.unshieldedAddress,
  });
});

it("keeps the connection and reports unavailable DUST when the runtime connector omits it", async () => {
  const fixture = createBrowserWalletFixture();
  Reflect.deleteProperty(fixture.api, "getDustAddress");
  const snapshots: WalletAddressSnapshot[] = [];

  await fixture.wallet.connect((snapshot) => {
    snapshots.push(snapshot);
  });

  expect(fixture.wallet.shieldedAddress).toBe(fixture.addresses.shielded.shieldedAddress);
  expect(fixture.wallet.unshieldedAddress).toBe(fixture.addresses.unshielded.unshieldedAddress);
  expect(fixture.wallet.dustAddress).toBeUndefined();
  expect(snapshots.at(-1)).toStrictEqual({
    dustUnavailable: "This connector does not expose a DUST address.",
    networkId: fixture.configuration.networkId,
    shieldedAddress: fixture.addresses.shielded.shieldedAddress,
    unshieldedAddress: fixture.addresses.unshielded.unshieldedAddress,
  });
});

it("keeps validated addresses when the connector rejects its DUST read", async () => {
  const fixture = createBrowserWalletFixture();
  fixture.api.getDustAddress.mockRejectedValue(new Error("DUST permission denied"));
  const snapshots: WalletAddressSnapshot[] = [];

  await fixture.wallet.connect((snapshot) => {
    snapshots.push(snapshot);
  });

  expect(fixture.wallet.dustAddress).toBeUndefined();
  expect(snapshots.at(-1)).toStrictEqual({
    dustUnavailable: "This connector could not provide a valid DUST address.",
    networkId: fixture.configuration.networkId,
    shieldedAddress: fixture.addresses.shielded.shieldedAddress,
    unshieldedAddress: fixture.addresses.unshielded.unshieldedAddress,
  });
});

it.each([
  ["malformed", { dustAddress: "not-a-midnight-address" }],
  ["for another network", createBrowserWalletAddresses("stagenet").dust],
] as const)("does not publish a DUST address that is %s", async (_description, dustAddress) => {
  const fixture = createBrowserWalletFixture();
  fixture.api.getDustAddress.mockResolvedValue(dustAddress);
  const snapshots: WalletAddressSnapshot[] = [];

  await fixture.wallet.connect((snapshot) => {
    snapshots.push(snapshot);
  });

  expect(fixture.wallet.dustAddress).toBeUndefined();
  expect(snapshots.at(-1)).toMatchObject({
    dustUnavailable: "This connector could not provide a valid DUST address.",
    networkId: fixture.configuration.networkId,
  });
});

it("clears publication and excludes late address results after a critical address failure", async () => {
  const fixture = createBrowserWalletFixture();
  const shielded =
    Promise.withResolvers<Awaited<ReturnType<ConnectedAPI["getShieldedAddresses"]>>>();
  const unshielded =
    Promise.withResolvers<Awaited<ReturnType<ConnectedAPI["getUnshieldedAddress"]>>>();
  const dust = Promise.withResolvers<Awaited<ReturnType<ConnectedAPI["getDustAddress"]>>>();
  fixture.api.getShieldedAddresses.mockReturnValue(shielded.promise);
  fixture.api.getUnshieldedAddress.mockReturnValue(unshielded.promise);
  fixture.api.getDustAddress.mockReturnValue(dust.promise);
  const snapshots: WalletAddressSnapshot[] = [];
  const connection = fixture.wallet.connect((snapshot) => {
    snapshots.push(snapshot);
  });

  await vi.waitFor(() => {
    expect(fixture.api.getShieldedAddresses).toHaveBeenCalledTimes(1);
  });
  shielded.resolve(fixture.addresses.shielded);
  await vi.waitFor(() => {
    expect(snapshots).toHaveLength(1);
  });
  unshielded.reject(new Error("Unshielded address failed."));

  await expect(connection).rejects.toThrow("Unshielded address failed.");
  expect(snapshots.at(-1)).toStrictEqual({ networkId: fixture.configuration.networkId });
  const callbacksBeforeLateDust = snapshots.length;
  dust.resolve(fixture.addresses.dust);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(snapshots).toHaveLength(callbacksBeforeLateDust);
});

it("clears publication on disconnect and excludes late address callbacks", async () => {
  const fixture = createBrowserWalletFixture();
  const shielded =
    Promise.withResolvers<Awaited<ReturnType<ConnectedAPI["getShieldedAddresses"]>>>();
  const unshielded =
    Promise.withResolvers<Awaited<ReturnType<ConnectedAPI["getUnshieldedAddress"]>>>();
  const dust = Promise.withResolvers<Awaited<ReturnType<ConnectedAPI["getDustAddress"]>>>();
  fixture.api.getShieldedAddresses.mockReturnValue(shielded.promise);
  fixture.api.getUnshieldedAddress.mockReturnValue(unshielded.promise);
  fixture.api.getDustAddress.mockReturnValue(dust.promise);
  const snapshots: WalletAddressSnapshot[] = [];
  const connection = fixture.wallet.connect((snapshot) => {
    snapshots.push(snapshot);
  });

  await vi.waitFor(() => {
    expect(fixture.api.getShieldedAddresses).toHaveBeenCalledTimes(1);
  });
  shielded.resolve(fixture.addresses.shielded);
  await vi.waitFor(() => {
    expect(snapshots).toHaveLength(1);
  });
  await fixture.wallet.disconnect();
  expect(snapshots.at(-1)).toStrictEqual({ networkId: fixture.configuration.networkId });
  const callbacksBeforeLateAddresses = snapshots.length;
  unshielded.resolve(fixture.addresses.unshielded);
  dust.resolve(fixture.addresses.dust);

  await expect(connection).rejects.toThrow("session changed");
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(snapshots).toHaveLength(callbacksBeforeLateAddresses);
});
