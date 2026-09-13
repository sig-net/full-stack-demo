# Read-only readiness

Read the existing `.local-vault/session.md` directly if present. Verify its paths and identities.
For this mode read only the README prerequisites/configuration sections as needed. Setup, reset,
funding and signing are outside the readiness check. Do not enumerate credential or cache files.

Inspect selected Docker labels/images/ports, UI response, both served asset hashes, local chain
and fork marker, contract presence and browser readiness. Use the configured local endpoints.
The following default routes and payloads were executed successfully. Bound each request with a
short timeout. Return only public status fields, never full environment or log output.

| Service              | Read-only request                                          | Evidence                                                |
| -------------------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| UI                   | GET http://localhost:3000/                                 | HTTP 200                                                |
| Server compatibility | GET http://localhost:3000/api/runtime-config               | HTTP 200, public fields, Signet address and fingerprint |
| Prover               | GET http://127.0.0.1:6300/health                           | HTTP 200, JSON status ok                                |
| Prover version       | GET http://127.0.0.1:6300/version                          | Version text, compare with expected stack image         |
| Midnight node        | JSON-RPC system_health at http://127.0.0.1:9944            | isSyncing false, local peer policy considered           |
| Anvil                | JSON-RPC eth_chainId and eth_getCode at configured marker  | Chain and marker match generated configuration          |
| Indexer              | POST http://127.0.0.1:8088/api/v3/graphql with query below | Current block and configured contract presence          |

For server-assisted operations, compare the applied runtime snapshot with the server compatibility
result. The app reports unavailable compatibility separately from differing fields. Independent
wallet connection does not establish eligibility for local funding or relayer assistance. Inspect
`src/providers/runtime-config-context.tsx` for the current comparison and request-header boundary.
Do not reset intentional runtime overrides or retry funding to resolve a configuration mismatch.

For block progress use `{"query":"{ block { height } }"}`. For each configured public contract
address, POST JSON with the following query and `variables.address` set to that address:

```graphql
query ($address: HexEncoded!) {
  contractAction(address: $address) {
    __typename
    address
  }
}
```

Require no GraphQL errors and a non-null matching address. This establishes indexed contract
presence, not every ledger invariant. Compare served `/zk/compiler/contract-manifest.json` and
`/zk/signet/compiler/contract-manifest.json` bytes with `src/lib/midnight/zk-manifest-hashes.ts` using SHA-256.

Use the session's identified browser owner as relay. If ownership is unknown, make one tab-list
attempt. If the prepared profile is owned elsewhere, ask that owner for
an observed snapshot and read-only wallet RPC results. The source account, extension chain and
marker must agree with the intended local deployment. Distinguish source ERC-20 balance from
shielded vault balance. If the UI provides only readiness indicators, report that limitation rather
than inventing exact ETH, token or spendable DUST amounts. Record pending operation state and the
next enabled control. Historical Activity rows alone do not establish current deployment state.

Verify active launcher arguments and its cap marker separately from the configured launcher.
An isolated preflight proves the candidate launcher, not activation in the current MCP connection.
Do not restart that connection unless scope permits it. Report readiness to begin the selected
operation, not a new successful deposit. Return probe results, unresolved inputs and next action.
