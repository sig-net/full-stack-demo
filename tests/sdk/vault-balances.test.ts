import { Interface, JsonRpcProvider } from "ethers";
import { expect, it, vi } from "vitest";

import { fetchErc20Decimals } from "@/lib/constants/token-metadata";
import { AAVE_USDC, STATA_USDC, stataAssetsPerShare } from "@/lib/midnight/evm-stata";
import { erc20Balance, evmProvider, vaultTokenType } from "@/lib/midnight/vault";
import { readBalances } from "@/lib/midnight/vault-balances";
import { parseTokenAmount } from "@/lib/utils/token-amount";

import { account } from "../evm/browser-wallet-fixture";
import { createVaultFixture } from "./vault-fixture";

vi.mock(import("@/lib/midnight/vault"), { spy: true });
vi.mock(import("@/lib/constants/token-metadata"), { spy: true });

it.each(["dust", "unshielded", "shielded", "deposit", "pool", "decimals"])(
  "preserves independent reads after %s fails",
  async (failure) => {
    const binding = await createVaultFixture();
    const coin = vaultTokenType(account, binding.environment.contractAddress);
    vi.spyOn(binding.providers.balancesSource, "dust").mockImplementation(() =>
      failure === "dust" ? Promise.reject(new Error("dust")) : Promise.resolve(3n),
    );
    vi.spyOn(binding.providers.balancesSource, "unshielded").mockImplementation(() =>
      failure === "unshielded"
        ? Promise.reject(new Error("unshielded"))
        : Promise.resolve({ night: 4n }),
    );
    vi.spyOn(binding.providers.balancesSource, "shielded").mockImplementation(() =>
      failure === "shielded"
        ? Promise.reject(new Error("shielded"))
        : Promise.resolve({ [coin]: 5n }),
    );
    vi.mocked(erc20Balance).mockImplementation((_rpc, _token, address) =>
      address === failure ? Promise.reject(new Error(address)) : Promise.resolve(9n),
    );
    vi.mocked(fetchErc20Decimals).mockImplementation(() =>
      failure === "decimals" ? Promise.reject(new Error("decimals")) : Promise.resolve(8),
    );
    try {
      const result = await readBalances(
        binding.providers,
        binding.environment,
        [account],
        "deposit",
        "pool",
      );
      expect(result.dust).toBe(failure === "dust" ? null : 3n);
      expect(result.night).toBe(failure === "unshielded" ? null : 4n);
      expect(result.perToken[account]?.vaultUnits).toBe(failure === "shielded" ? null : 5n);
      expect(result.perToken[account]?.depositUnits).toBe(failure === "deposit" ? null : 9n);
      expect(result.perToken[account]?.vaultPoolUnits).toBe(failure === "pool" ? null : 9n);
      expect(result.perToken[account]?.decimals).toBe(failure === "decimals" ? null : 8);
    } finally {
      binding.providers.privateStateProvider.dispose();
      await binding.providers.publicDataProvider.dispose();
      await binding.wallet.disconnect();
    }
  },
);

it("uses observed share and asset precision with the supplied RPC", async () => {
  const provider = new JsonRpcProvider("https://precision.example.invalid");
  const abi = new Interface(["function convertToAssets(uint256 shares) view returns (uint256)"]);
  const call = vi
    .spyOn(provider, "call")
    .mockResolvedValue(abi.encodeFunctionResult("convertToAssets", [1250000n]));
  vi.mocked(evmProvider).mockReturnValue(provider);
  vi.mocked(fetchErc20Decimals).mockImplementation((address) =>
    Promise.resolve(address === STATA_USDC ? 8 : 6),
  );
  try {
    expect(await stataAssetsPerShare("https://precision.example.invalid")).toBe(1.25);
    expect(call).toHaveBeenCalledTimes(1);
    const request = call.mock.calls[0]?.[0];
    expect(request?.data).toBe(abi.encodeFunctionData("convertToAssets", [100000000n]));
    expect(fetchErc20Decimals).toHaveBeenCalledWith(
      STATA_USDC,
      expect.objectContaining({ rpcUrl: "https://precision.example.invalid" }),
    );
    expect(fetchErc20Decimals).toHaveBeenCalledWith(
      AAVE_USDC,
      expect.objectContaining({ rpcUrl: "https://precision.example.invalid" }),
    );
  } finally {
    provider.destroy();
  }
});

it("parses exact decimal precision and rejects unsupported amount forms", () => {
  expect(parseTokenAmount("1.12345678", 8)).toBe(112345678n);
  const invalid = ["1.123456789", "0", "-1", "1e3"];
  expect(invalid.length).toBeGreaterThan(0);
  for (const amount of invalid) expect(() => parseTokenAmount(amount, 8)).toThrow();
});
