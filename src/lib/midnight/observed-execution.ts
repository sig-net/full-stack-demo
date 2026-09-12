import {
  signBidirectionalEventToSignedEvmTransaction,
  type RequestIdHex,
  type SignetRequestResponseReader,
} from '@sig-net/midnight';
import type { JsonRpcProvider } from 'ethers';

// Trace bytes are untrusted candidates until the caller verifies the attestation.
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
      hash = signBidirectionalEventToSignedEvmTransaction(
        request,
        response,
      ).hash;
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
    const frame: unknown = await provider.send('debug_traceTransaction', [
      hash,
      { tracer: 'callTracer' },
    ]);
    assertActive();
    if (typeof frame !== 'object' || frame === null)
      throw new Error('EVM call trace is missing its top call frame');
    const output = 'output' in frame ? frame.output : '0x';
    if (typeof output !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(output))
      throw new Error('EVM call trace returned invalid output bytes');
    return { success: true, output };
  }
  return undefined;
}
