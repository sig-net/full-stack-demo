import {
  type RequestIdHex,
  signBidirectionalEventToSignedEvmTransaction,
  type SignetRequestResponseReader,
} from "@sig-net/midnight";
import type { JsonRpcProvider } from "ethers";

/**
 * Reads execution output as an untrusted candidate for subsequent attestation verification.
 *
 * @param reader - Request and response source paired with the active deployment.
 * @param provider - RPC used for mined receipts and execution traces.
 * @param requestId - Captured signature request to inspect.
 * @param assertActive - Checks the calling session before and after external reads.
 * @returns Observed execution status and bytes, or undefined while no receipt is available.
 * @throws {Error} If session ownership, RPC reads or trace validation fail.
 */
export async function observeExecution(
  reader: SignetRequestResponseReader,
  provider: JsonRpcProvider,
  requestId: RequestIdHex,
  assertActive: () => void,
): Promise<{ success: boolean; output: string | null } | undefined> {
  assertActive();
  const request = await reader.getSignatureRequest(requestId);
  for (const response of await reader.getSignatureRespondedEvents(requestId)) {
    let hash: string | null;
    try {
      hash = signBidirectionalEventToSignedEvmTransaction(request, response).hash;
    } catch {
      continue;
    }
    if (hash === null) continue;
    assertActive();
    const receipt = await provider.getTransactionReceipt(hash);
    assertActive();
    if (receipt === null) continue;
    if (receipt.status !== 1) return { success: false, output: null };
    assertActive();
    const frame: unknown = await provider.send("debug_traceTransaction", [
      hash,
      { tracer: "callTracer" },
    ]);
    assertActive();
    if (typeof frame !== "object" || frame === null)
      throw new Error("EVM call trace is missing its top call frame");
    const output = "output" in frame ? frame.output : "0x";
    if (typeof output !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(output))
      throw new Error("EVM call trace returned invalid output bytes");
    return { success: true, output };
  }
  return undefined;
}
