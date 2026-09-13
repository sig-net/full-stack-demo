import {
  encodeFunctionData,
  parseEventLogs,
  erc20Abi,
  getAddress,
  type Hash,
} from 'viem';
import type { Wallet, Erc20Transfer } from './wallet/Wallet';

export async function transferErc20(
  wallet: Wallet,
  input: Erc20Transfer,
): Promise<{ hash: Hash; units: bigint }> {
  const token = getAddress(input.token);
  const destination = getAddress(input.destination);
  const { units } = input;
  const client = wallet.publicClient;
  const account = getAddress(wallet.account);
  if (units <= 0n) throw new Error('Enter an amount greater than zero.');
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [destination, units],
  });
  const [balance, nativeBalance, gas, gasPrice] = await Promise.all([
    client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [account],
    }),
    client.getBalance({ address: account }),
    client.estimateGas({ account, to: token, data }),
    client.getGasPrice(),
  ]);
  if (balance < units) throw new Error('Insufficient token balance.');
  if (nativeBalance < gas * gasPrice)
    throw new Error('Insufficient native balance for network fees.');
  await wallet.verify();
  input.beforeSubmit?.();
  wallet.assertActive();
  const hash = await wallet.client.writeContract({
    address: token,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [destination, units],
  });
  // Extension approval can finish after session replacement. Keep the resulting hash observable.
  input.submitted(hash);
  const receipt = await client.waitForTransactionReceipt({
    hash,
    timeout: 180_000,
  });
  input.submitted(receipt.transactionHash);
  if (receipt.status !== 'success')
    throw new Error('The EVM transfer reverted.');
  const transaction = await client.getTransaction({
    hash: receipt.transactionHash,
  });
  if (
    getAddress(transaction.from) !== account ||
    !transaction.to ||
    getAddress(transaction.to) !== getAddress(token) ||
    transaction.input.toLowerCase() !== data.toLowerCase() ||
    transaction.value !== 0n
  )
    throw new Error(
      'The mined transaction replaced or cancelled this token transfer.',
    );
  const transfers = parseEventLogs({
    abi: erc20Abi,
    eventName: 'Transfer',
    logs: receipt.logs,
  });
  if (
    !transfers.some(
      log =>
        getAddress(log.address) === getAddress(token) &&
        getAddress(log.args.from) === account &&
        getAddress(log.args.to) === destination &&
        log.args.value === units,
    )
  )
    throw new Error(
      'The receipt does not confirm the requested token transfer.',
    );
  return { hash: receipt.transactionHash, units };
}
