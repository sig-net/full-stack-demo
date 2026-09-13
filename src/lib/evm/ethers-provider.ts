import { FetchRequest, JsonRpcProvider } from "ethers";

/**
 * Owns a captured HTTP provider until its operation, including retries, finishes.
 *
 * @param rpcUrl - Validated endpoint captured by the caller.
 * @param operation - Work sharing the owned provider until completion.
 * @returns The operation result after provider teardown.
 * @throws {Error} If provider construction or the operation fails.
 */
export async function withEthersProvider<T>(
  rpcUrl: string,
  operation: (provider: JsonRpcProvider) => Promise<T>,
): Promise<T> {
  const request = new FetchRequest(rpcUrl);
  request.timeout = 120_000;
  const provider = new JsonRpcProvider(request, undefined, { staticNetwork: true });
  try {
    return await operation(provider);
  } finally {
    provider.destroy();
  }
}
