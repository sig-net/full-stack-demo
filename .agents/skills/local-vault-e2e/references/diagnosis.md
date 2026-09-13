# Diagnose the stage before retrying

| Observation                            | Next evidence and action                                                                                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transport closed during proving upload | Inspect bounded MCP stderr for ERR_STRING_TOO_LONG, verify launcher/version and run the public upload preflight. Do not send another deposit.                                                                       |
| Server-assisted action unavailable     | Inspect /api/runtime-config and the applied snapshot. Distinguish failed compatibility reads from named field differences. Reconcile intended configuration before retrying, preserving independent wallet actions. |
| MetaMask chooser stays open            | Inspect connection error and expected fork marker, account/chain events and pending extension approval. Reconnect deliberately after correcting configuration.                                                      |
| Confirmed transfer, no start request   | Preserve transfer hash and destination. Inspect deposit funds and current request state before using the existing continuation.                                                                                     |
| Confirmed sweep, pending claim         | Restore the same caller secret, select the token and use Pending deposit request ID / Recover pending deposit. The live request supplies the amount.                                                                |
| Claim SUCCESS but UI stale             | Read the wallet balance and refresh outcome separately. Do not repeat a successful claim or sweep.                                                                                                                  |
| expected instance of LedgerParameters  | Compare actual ledger constructors resolved by producing and consuming SDKs. The project pins ledger-v9 consistently. Do not change cryptography to mask module duplication.                                        |
| Invalid attestation signature          | Trace wire-to-circuit conversion against the installed SDK and example call site. The app uses respondBidirectionalEventToCircuitInput at settlement boundaries.                                                    |
| signBidirectional verifier 404         | Check for the following successful /zk/signet lookup. The observed registry probes vault then Signet providers. A successful fallback is not a failed proof.                                                        |
| UI chunks stall                        | Check the exact Next process, its private log and HTTP response. Avoid attributing a stall to cache size without evidence.                                                                                          |

For current source paths start at `src/lib/midnight/vault.ts`, the deposit dialog and the vault
operation owner. After a refactor, search for the relevant exported operation or UI label rather
than following historical file paths blindly. The installed SDK and examples implementation are
the contract authorities. Do not add private wallet-key signing to bypass the product UI.

## Correlation and fees

Query the configured local indexer, using bounded requests. This executed query shape selects
actual successful transaction fees, including block height:

```graphql
query ($offset: TransactionOffset!) {
  transactions(offset: $offset) {
    hash
    block {
      height
    }
    ... on RegularTransaction {
      identifiers
      fee
      transactionResult {
        status
      }
    }
  }
}
```

Supply the public transaction identifier or hash in offset. Verify SUCCESS, deduplicate hashes,
and sum integer SPECK values. One DUST is 10^15 SPECK. Report user start/claim separately from MPC
signature/attestation and wallet funding/registration. Wallet DUST balance differences are not
fee totals because DUST regenerates. Large aliased block scans can exceed indexer complexity.

Inspect live depositEventMap and depositSettleViews through the installed vault ledger reader to
confirm recovery eligibility and final removal. Record the request ID and exact amount, without
printing secret commitments or wallet material. Distinguish a missing request before start from
an absent request after a successful claim by correlating the other evidence.

Proof server DEBUG output can contain proof preimages. Return selected non-sensitive status,
timing and error lines only. Avoid dumping whole setup logs, request bodies or Docker environments.

A swap is a different operation: establish input/output token, minimum output/slippage, current
quote and shielded balance before signing. Correlate its request, EVM execution and claim/refund.
Do not call a refund a successful swap, or infer swap correctness from a deposit passing.
