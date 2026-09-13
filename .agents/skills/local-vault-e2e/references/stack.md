# Stack, deployment and reuse

Use the UI README as the human procedure and source of current required versions and commands.
Locate `examples/erc20-vault/deploy/scripts/setup-local.ts` in the selected examples checkout.
Its implementation is in `examples/erc20-vault/deploy/src/setup-local.ts`. Shared Node provider,
wallet, funding and progress utilities are in `packages/lib/src`. Only inspect the implementation
for the failing stage. The integration tests are comparison material, not a replacement UI driver.

## Identity and ownership

Inspect actual container names, Compose project labels, working directories, mounts, images and
port mappings. Do not print full Docker inspect output: container environments include secrets.
Known default ports are Midnight node 9944, indexer 8088, Anvil 8545 and proof server 6300.
The UI defaults to port 3000. Check configured endpoints rather than assuming these are free.
A proof server can be owned by another checkout and still be deliberately shared. Preserve it.

Only Anvil consumes the upstream Sepolia fork URL. The UI and backend use local Anvil, and the
containerised responder uses the Compose EVM service. Chain ID 11155111 alone is insufficient:
public Sepolia shares it. Compare the generated local marker through the browser wallet RPC.
Generated `.env.local`, `.local-demo/instance.json` and setup state identify the deployment.
Read only selected public fields into output. Do not dump `.env`, Docker environment or setup logs.

## Reuse first

For a kept-stack check, validate the existing services, fork marker and contracts before doing any
setup. The README setup command is resumable and refuses a mismatched saved instance. An unchanged
reuse run should preserve deployment identities. Hash public configuration identifiers or private
files without displaying their contents to compare before and after.

The setup log is private. Observe named stages, elapsed progress, block advancement and filtered
prover results. Sequential wallet funding and the vault's multiple maintenance transactions can
be slow. Silence alone is not proof of a hang. Check which await boundary is active and whether a
transaction was submitted before interrupting or retrying. Shared `withOperationProgress` and its
callers in `packages/lib/src` provide progress reporting. Prefer these over another timer helper.

Setup exports the UI `.env.local` and optional `.local-demo/testing-user.env` with independent
Midnight seed and vault caller secret. Testing-role credentials may already be funded. Use a
separate fresh identity when acceptance requires observing the low-funds path.

## Assets and UI process

Run the README asset preparation command when required. Proving assets are served by this Next
app from `public/zk`, with vault assets at `/zk` and Signet assets at `/zk/signet`. Verify both
served manifest hashes against the application's pinned hashes. An unchanged reuse must not need
asset recompilation merely because a browser restarts.

An interactive human can run `yarn dev`. For an agent-owned long session, launch that same command
with detached process ownership, stdin closed and stdout/stderr redirected to a private file.
Record its PID/process group, checkout and log. Use the host runtime's subprocess support, not an
MCP tool's long-lived output pipe. In the observed session a severed logging path coincided with
Next exception-reporting recursion and stalled chunks. File-backed launch restored responsiveness.
Verify HTTP response and later process survival. Restart only the identified checkout's process
when regenerated environment requires it. Do not kill every Node process or delete caches by default.

## Reset is a separate operation

A reset discards local chain state. If reset is in scope, capture settlement evidence first and
preserve state the user needs. Check mounts before selecting a backup strategy. Stopped-container
exports only capture writable layers, not mounted volumes. Preserve private configuration and
Anvil state, verify non-empty archives and their inventories, then remove only owned containers.
Execute the README scoped reset and configuration regeneration commands. Preserve the foreign
proof server. Recheck the new marker, deployed contracts, responder endpoints and served assets.
Do not reset simply to recover a pending deposit or debug a browser transport crash.
