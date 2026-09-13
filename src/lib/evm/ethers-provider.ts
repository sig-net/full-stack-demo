import { FetchRequest, JsonRpcProvider } from "ethers";

/**
 * Owns a captured HTTP provider until its operation, including retries, finishes.
 *
 * @param rpcUrl - Validated endpoint captured by the caller.
 * @param operation - Work sharing the owned provider until completion.
 * @param limits - Optional read deadline and caller cancellation, covering response bodies and retries.
 * @param limits.timeoutMs - Maximum elapsed time including transport and callback work.
 * @param limits.signal - Cancels all reads when their caller becomes obsolete.
 * @returns The operation result after provider teardown.
 * @throws {Error} If provider construction or the operation fails.
 */
export async function withEthersProvider<T>(
  rpcUrl: string,
  operation: (provider: JsonRpcProvider) => Promise<T>,
  limits?: { timeoutMs: number; signal?: AbortSignal },
): Promise<T> {
  const request = new FetchRequest(rpcUrl);
  request.timeout = 120_000;
  const controller = new AbortController();
  const signal = limits?.signal
    ? AbortSignal.any([controller.signal, limits.signal])
    : controller.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectAborted: (() => void) | undefined;
  if (limits) {
    signal.throwIfAborted();
    request.timeout = limits.timeoutMs;
    request.retryFunc = () => Promise.resolve(false);
    // The deadline covers response-body consumption, which the browser transport must also abort.
    request.getUrlFunc = async (req) => {
      signal.throwIfAborted();
      const response = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body ? new Uint8Array(req.body).buffer : undefined,
        signal,
      });
      const body = new Uint8Array(await response.arrayBuffer());
      return {
        statusCode: response.status,
        statusMessage: response.statusText,
        headers: Object.fromEntries(response.headers),
        body,
      };
    };
    timer = setTimeout(() => {
      controller.abort(new Error("EVM RPC read timed out. Check the connection and retry."));
    }, limits.timeoutMs);
  }
  const provider = new JsonRpcProvider(request, undefined, { staticNetwork: true });
  try {
    if (!limits) return await operation(provider);
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAborted = () => {
        reject(signal.reason instanceof Error ? signal.reason : new Error("EVM read cancelled."));
      };
      signal.addEventListener("abort", rejectAborted, { once: true });
    });
    return await Promise.race([operation(provider), aborted]);
  } finally {
    clearTimeout(timer);
    if (rejectAborted) signal.removeEventListener("abort", rejectAborted);
    controller.abort();
    provider.destroy();
  }
}
