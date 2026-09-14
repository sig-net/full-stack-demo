import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  type Hash,
  type Hex,
  parseEventLogs,
  type PublicClient,
  type TransactionReceipt,
} from "viem";

import { Erc20TransferError } from "./transfer-failure";
import type { Erc20Transfer, Erc20TransferReceipt, Wallet } from "./wallet/Wallet";

const RECEIPT_TIMEOUT_MS = 180_000;

/** Exact intent a mined receipt has to match before the transfer counts as confirmed. */
interface SettlementIntent {
  account: Address;
  token: Address;
  destination: Address;
  units: bigint;
  data: Hex;
}

function intentOf(account: Address, input: Erc20TransferReceipt): SettlementIntent {
  const token = getAddress(input.token);
  const destination = getAddress(input.destination);
  return {
    account,
    token,
    destination,
    units: input.units,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [destination, input.units],
    }),
  };
}

/**
 * Accepts a mined receipt only when it carries this exact transfer, never a replacement.
 *
 * @param client - Public client used to read the mined transaction alongside its receipt.
 * @param receipt - Receipt observed for the submitted or replacing hash.
 * @param intent - Captured account, token, recipient and exact base-unit amount.
 * @returns The mined hash and the transferred units.
 * @throws {Erc20TransferError} If the receipt reverted or settled a different transaction.
 */
async function verifySettlement(
  client: PublicClient,
  receipt: TransactionReceipt,
  intent: SettlementIntent,
): Promise<{ hash: Hash; units: bigint }> {
  if (receipt.status !== "success")
    throw new Erc20TransferError("reverted", "The EVM transfer reverted.");
  const transaction = await client.getTransaction({ hash: receipt.transactionHash });
  if (
    getAddress(transaction.from) !== intent.account ||
    !transaction.to ||
    getAddress(transaction.to) !== intent.token ||
    transaction.input.toLowerCase() !== intent.data.toLowerCase() ||
    transaction.value !== 0n
  )
    throw new Erc20TransferError(
      "replaced",
      "The mined transaction replaced or cancelled this token transfer.",
    );
  const transfers = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs });
  if (
    !transfers.some(
      (log) =>
        getAddress(log.address) === intent.token &&
        getAddress(log.args.from) === intent.account &&
        getAddress(log.args.to) === intent.destination &&
        log.args.value === intent.units,
    )
  )
    throw new Erc20TransferError(
      "replaced",
      "The receipt does not confirm the requested token transfer.",
    );
  return { hash: receipt.transactionHash, units: intent.units };
}

/**
 * Verifies the mined calldata and Transfer event against captured inputs, including replacements.
 *
 * @param wallet - Signing session whose public client also tracks settlement.
 * @param input - Exact transfer intent and callbacks that preserve submitted hashes.
 * @returns The mined transaction hash and verified transferred units.
 * @throws {Erc20TransferError} If preflight, settlement or receipt identity checks fail.
 * @throws {Error} If signing or session verification fails, carrying the provider cause.
 */
export async function transferErc20(
  wallet: Wallet,
  input: Erc20Transfer,
): Promise<{ hash: Hash; units: bigint }> {
  const client = wallet.publicClient;
  const account = getAddress(wallet.account);
  if (input.units <= 0n)
    throw new Erc20TransferError("preflight", "Enter an amount greater than zero.");
  const intent = intentOf(account, input);
  const [balance, nativeBalance, gas, gasPrice] = await Promise.all([
    client.readContract({
      address: intent.token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    }),
    client.getBalance({ address: account }),
    client.estimateGas({ account, to: intent.token, data: intent.data }),
    client.getGasPrice(),
  ]);
  if (balance < intent.units)
    throw new Erc20TransferError("preflight", "Insufficient token balance.");
  if (nativeBalance < gas * gasPrice)
    throw new Erc20TransferError("fees", "Insufficient native balance for network fees.");
  await wallet.verify();
  input.beforeSubmit?.();
  wallet.assertActive();
  const hash = await wallet.client.writeContract({
    address: intent.token,
    abi: erc20Abi,
    functionName: "transfer",
    args: [intent.destination, intent.units],
  });
  // Submission can finish after session replacement. Keep the resulting hash observable.
  input.submitted(hash);
  const receipt = await client.waitForTransactionReceipt({
    hash,
    timeout: RECEIPT_TIMEOUT_MS,
    onReplaced: (replacement) => {
      input.submitted(replacement.transaction.hash);
    },
  });
  input.submitted(receipt.transactionHash);
  return verifySettlement(client, receipt, intent);
}

/**
 * Rechecks a submitted transfer without signing or sending anything.
 *
 * @param wallet - Session supplying the public client and the captured sending account.
 * @param input - The submitted hash and the exact intent it has to satisfy.
 * @returns The mined hash and the transferred units once the receipt confirms this transfer.
 * @throws {Erc20TransferError} If the transaction is still pending, reverted or replaced.
 */
export async function recheckErc20Transfer(
  wallet: Wallet,
  input: Erc20TransferReceipt & { hash: Hash },
): Promise<{ hash: Hash; units: bigint }> {
  const client = wallet.publicClient;
  const intent = intentOf(getAddress(wallet.account), input);
  const receipt = await client
    .getTransactionReceipt({ hash: input.hash })
    .catch((error: unknown) => {
      throw new Erc20TransferError(
        "unknown",
        "This transaction has no receipt yet, so its outcome is still open.",
        { cause: error },
      );
    });
  return verifySettlement(client, receipt, intent);
}
