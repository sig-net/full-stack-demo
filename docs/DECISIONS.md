# Configuration decisions

## Separate configuration contracts with one transaction owner

Midnight endpoints, the EVM chain and vault deployment are independent records. They share one immutable transaction owner so validation completes before dependent resources are invalidated and a revision is published. The editor owns its draft. Multiple editors cannot overwrite a newer applied configuration through stale Apply.

Browser startup uses network defaults. Generated local endpoints and deployment values remain server inputs and are entered explicitly into the browser editor. Clearing fields preserves an incomplete but editable configuration. The independent vault identity stays in page memory across configuration changes.

Deployment defaults use each installed package lookup independently. Missing publications leave only the corresponding field empty. Reset resolves the lookups again, including publications added by future package releases. Stagenet endpoint literals intentionally mirror the integration repository source requested for this application. Public Preview, Preprod and Mainnet endpoints use the documented v4 paths.

EVM selection distinguishes local, Sepolia and mainnet. Public selections carry fixed chain IDs, while local RPC discovery is an explicit remote read. Publicnode defaults passed browser-origin reads from localhost. The dependency Sepolia default rejected the chain-discovery request in the reported environment. Public preset connections therefore use their known chain without making that RPC request, and browser extensions still report their actual selected chain. Local and nonstandard chain overrides require discovery/verification. Vault routing additionally requires Sepolia, with asset and routing availability checked by their consuming operations. Optional EVM explorers affect presentation only.

The server has three local development faucets: NIGHT, ETH and ERC-20. Its Midnight network is fixed to `undeployed`, its EVM chain is fixed to `11155111`, and NIGHT comes from the package-exported canonical local genesis seed. Server endpoint overrides may change local service locations only. The public descriptor contains availability and endpoint settings, never credentials or deployment values.

The browser owns runtime configuration, wallets, identity, registration and vault operations. It enables local faucet actions only when its applied Midnight and EVM endpoints exactly match the public local descriptor. Vault fields and presentation URLs do not participate in this decision. Public and mixed configurations keep wallet and vault controls available while users fund their own addresses. NIGHT transfer and NIGHT registration are separate user-visible actions.

Verification covers fixed server policy, endpoint overrides, exact local client matching, isolated faucet request types, explicit registration and client-owned operation readiness. Public HTTP and WebSocket transport probes establish endpoint availability separately from funded contract acceptance.
