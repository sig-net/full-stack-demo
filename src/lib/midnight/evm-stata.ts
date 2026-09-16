import {
  asciiPadded,
  MPC_PARAMS_BYTES,
  MPCDestination,
  MPCSignatureAlgorithm,
} from "@sig-net/midnight";
import { type ConstantContractMethod, Contract } from "ethers";
import { formatUnits } from "viem";

import { sepoliaChainConfig } from "@/lib/config/runtime";
import { fetchErc20Decimals } from "@/lib/constants/token-metadata";
import { withEthersProvider } from "@/lib/evm/ethers-provider";

/** Aave v3 Sepolia USDC: the underlying the vault lends (initialize's stataUnderlying). */
export const AAVE_USDC = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";

/** Aave v3 Sepolia stataUSDC: the non-rebasing ERC-4626 wrapper (a proxy). */
export const STATA_USDC = "0x8A88124522dbBF1E56352ba3DE1d9F78C143751e";

/** Must match the ERC-4626 deposit call in the vault supply envelope. */
export const STATA_DEPOSIT_SELECTOR = new Uint8Array([0x6e, 0x55, 0x3f, 0x65]);

/** Must match the ERC-4626 redeem call in the vault redemption envelope. */
export const STATA_REDEEM_SELECTOR = new Uint8Array([0xba, 0x08, 0x76, 0x52]);

/** approve(address,uint256) selector (approveStata grants the wrapper an allowance on USDC). */
export const APPROVE_SELECTOR = new Uint8Array([0x09, 0x5e, 0xa7, 0xb3]);

/** Effectively-unlimited allowance (matches the contract's approveStata, 2^128-1). */
export const MAX_APPROVE = 340282366920938463463374607431768211455n;

/** MPC decodes deposit's uint256 shares return against this (byte-matches supplyOutputSchema, 36). */
export const SUPPLY_OUTPUT_SCHEMA = '[{"name":"shares","type":"uint256"}]';
/** MPC re-packs the decoded shares into a uint64 (byte-matches supplyRespondSchema, 35). */
export const SUPPLY_RESPOND_SCHEMA = '[{"name":"shares","type":"uint64"}]';
/** MPC decodes redeem's uint256 assets return against this (byte-matches redeemOutputSchema, 36). */
export const REDEEM_OUTPUT_SCHEMA = '[{"name":"assets","type":"uint256"}]';
/** MPC re-packs the decoded assets into a uint64 (byte-matches redeemRespondSchema, 35). */
export const REDEEM_RESPOND_SCHEMA = '[{"name":"assets","type":"uint64"}]';

/**
 * Values one whole wrapper share using separately observed share and asset precision.
 *
 * @param evmRpcUrl - Captured RPC endpoint for both contract reads.
 * @returns A display-only underlying-token value per share.
 * @throws {Error} If decimals or the conversion read is unavailable.
 */
export async function stataAssetsPerShare(evmRpcUrl: string): Promise<number> {
  return withEthersProvider(evmRpcUrl, async (provider) => {
    const wrapper = new Contract(
      STATA_USDC,
      ["function convertToAssets(uint256 shares) view returns (uint256)"],
      provider,
    );
    const config = sepoliaChainConfig(evmRpcUrl);
    const [shareDecimals, assetDecimals] = await Promise.all([
      fetchErc20Decimals(STATA_USDC, config),
      fetchErc20Decimals(AAVE_USDC, config),
    ]);
    const assets: bigint = await wrapper.getFunction<ConstantContractMethod<bigint[], bigint>>(
      "convertToAssets",
    )(10n ** BigInt(shareDecimals));
    return Number(formatUnits(assets, assetDecimals));
  });
}

const RAY = 10n ** 27n;
const SECONDS_PER_YEAR = 31_536_000;
/**
 * Converts the reserve's current liquidity rate to a compounded annual display yield.
 *
 * @param evmRpcUrl - Captured RPC endpoint for the wrapper and its pool.
 * @returns Annual yield as a fraction.
 * @throws {Error} If pool discovery or reserve data reads fail.
 */
export async function stataSupplyApy(evmRpcUrl: string): Promise<number> {
  return withEthersProvider(evmRpcUrl, async (provider) => {
    const wrapper = new Contract(STATA_USDC, ["function POOL() view returns (address)"], provider);
    const poolAddress: string =
      await wrapper.getFunction<ConstantContractMethod<never[], string>>("POOL")();
    const pool = new Contract(
      poolAddress,
      [
        "function getReserveData(address asset) view returns (tuple(tuple(uint256 data) configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))",
      ],
      provider,
    );
    const data =
      await pool.getFunction<ConstantContractMethod<string[], { currentLiquidityRate: bigint }>>(
        "getReserveData",
      )(AAVE_USDC);
    const apr = Number(data.currentLiquidityRate) / Number(RAY);
    return (1 + apr / SECONDS_PER_YEAR) ** SECONDS_PER_YEAR - 1;
  });
}

/**
 * Reads wrapper bytecode before offering lending controls.
 *
 * @param evmRpcUrl - Captured RPC endpoint.
 * @returns Whether the configured wrapper has deployed code.
 * @throws {Error} If the code read fails.
 */
export async function stataAvailable(evmRpcUrl: string): Promise<boolean> {
  return withEthersProvider(evmRpcUrl, async (provider) => {
    const code = await provider.getCode(STATA_USDC);
    return code !== "0x";
  });
}

/** Contract-fixed routing of a supply event (the supply-schema variant of VAULT_MPC_ROUTING). */
export const SUPPLY_MPC_ROUTING = {
  algo: MPCSignatureAlgorithm.ecdsa,
  dest: MPCDestination.unused,
  params: new Uint8Array(MPC_PARAMS_BYTES),
  outputDeserializationSchema: asciiPadded(SUPPLY_OUTPUT_SCHEMA, SUPPLY_OUTPUT_SCHEMA.length),
  respondSerializationSchema: asciiPadded(SUPPLY_RESPOND_SCHEMA, SUPPLY_RESPOND_SCHEMA.length),
};

/** Contract-fixed routing of a redeem event. */
export const REDEEM_MPC_ROUTING = {
  algo: MPCSignatureAlgorithm.ecdsa,
  dest: MPCDestination.unused,
  params: new Uint8Array(MPC_PARAMS_BYTES),
  outputDeserializationSchema: asciiPadded(REDEEM_OUTPUT_SCHEMA, REDEEM_OUTPUT_SCHEMA.length),
  respondSerializationSchema: asciiPadded(REDEEM_RESPOND_SCHEMA, REDEEM_RESPOND_SCHEMA.length),
};
