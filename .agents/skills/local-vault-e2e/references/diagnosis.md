# Diagnose the stage before retrying

| Observation                            | Next evidence and action                                                                                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transport closed during proving upload | Inspect bounded MCP stderr for ERR_STRING_TOO_LONG, verify launcher/version and run the public upload preflight. Do not send another deposit.                                                                       |
| MetaMask chooser stays open            | Inspect connection error and configured local/public chain, account/chain events and pending extension approval. Reconnect deliberately after correcting configuration.                                                      |
| Confirmed transfer, no start request   | Preserve transfer hash and destination. Inspect deposit funds and current request state before using the existing continuation.                                                                                     |
| Confirmed sweep, pending claim         | Restore the same caller secret, select the token and use Recover a deposit by request ID / Recover pending deposit. The live request supplies the amount.                                                                |
| Claim SUCCESS but UI stale             | Read the wallet balance and refresh outcome separately. Do not repeat a successful claim or sweep.                                                                                                                  |
| expected instance of LedgerParameters  | Compare actual ledger constructors resolved by producing and consuming SDKs. The project pins ledger-v9 consistently. Do not change cryptography to mask module duplication.                                        |
| Invalid attestation signature          | Trace wire-to-circuit conversion against the installed SDK and example call site. The app uses respondBidirectionalEventToCircuitInput at settlement boundaries.                                                    |
| signBidirectional verifier 404         | Check for the following successful /zk/signet lookup. The observed registry probes vault then Signet providers. A successful fallback is not a failed proof.                                                        |
| UI chunks stall                        | Check the exact Next process, its private log and HTTP response. Avoid attributing a stall to cache size without evidence.                                                                                          |

For current source paths start at `src/lib/midnight/vault.ts`, the deposit dialog and the vault
operation owner. After a refactor, search for the relevant exported operation or UI label rather
than following historical file paths blindly. The installed SDK and examples implementation are
the contract authorities. Do not add private wallet-key signing to bypass the product UI.

For node rejection170, inspect bounded node logs for the actual rejection kind. During task23 the
node reported InvalidDustSpendProof before creating a deposit request. Preserve the confirmed EVM
transfer and check pending requests and destination balance before another continuation. Facade
rebuild and full-page reload did not resolve that observed case. SDK validateTransaction disables
native proof verification, so a successful structural check is not node-acceptance evidence.
The local node exposed system_dryRun but rejected both external and container-loopback calls as
unsafe. Preserve its configuration and record that diagnostic limitation.

## Correlation and fees

To discover start and claim hashes without reading wallet logs, query recent actions on the
configured vault address. This bounded query identified both deposit calls during task20:

```graphql
query ($address: HexEncoded!) {
  contract(address: $address) {
    actions(limit: 12) {
      ... on ContractCall {
        entryPoint
      }
      transaction {
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
  }
}
```

Correlate the returned startDeposit and completeDeposit calls with the captured operation's
block window and request evidence, and verify SUCCESS. Recent actions alone cannot distinguish
concurrent deposits. If the bounded window omits the operation, use its captured block or
transaction offset. Capture the pending request before claim removes it. The installed public
data provider's `queryContractState(address, { type: "blockHeight", blockHeight })` also retrieved
the captured request at its known pending block after settlement for SDK attestation verification.

Query the configured local indexer, using bounded requests. The v3 schema rejects the
contractActions and applyStage fields that older task scripts used. The query shapes in this
file are the ones that answer. This executed query shape selects
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


For a reverted swap, inspect the EVM receipt and a bounded local call trace before changing the
stack. A task21 quote offered the best output at a pool estimate of 760299 gas, exceeding the
vault's fixed 700000 gas allowance. The pool call ran out of gas and the operation refunded.
The next viable tier completed successfully. Check the installed circuit/envelope allowance and
per-tier quote gas estimates. Do not override the signed gas envelope or reset liquidity to make
a quote executable. Confirm the earlier refund/claim settled before submitting another swap.

For swap evidence, read `swapEventMap` and `swapSettleViews`, not the deposit maps. Capture the
pending block for historical lookup after claim. Verify the signature-derived EVM transaction,
token transfers and the amountIn response attestation, then correlate startSwap and completeSwap.
Separate the maximum input surrendered from actual spend and returned change. Exclude user
transaction hashes when summing responder fees: Signet events can include the user's start call.
The amount fields' max controls exposed exact holdings during task21 when the visible balance
labels rounded them. Reading those controls does not require submitting another operation.
