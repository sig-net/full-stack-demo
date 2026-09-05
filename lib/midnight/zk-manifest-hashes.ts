// The sha256 of each zk asset tree's compiler/contract-manifest.json, as printed by
// `yarn zk-assets`. The zk config providers refuse an origin whose manifest hashes differently,
// so refresh both values whenever the vault or signet contract package changes.

/** `<origin>/compiler/contract-manifest.json`: the vault's 17 circuits. */
export const VAULT_ZK_MANIFEST_SHA256 =
  'f97e17f47e5c1e8443c4d28ef3b7f593f349dde2ac511fcb7558c010a5a2ce8f';

/** `<origin>/signet/compiler/contract-manifest.json`: the signet contract the vault calls. */
export const SIGNET_ZK_MANIFEST_SHA256 =
  'd0ef716585d67bafa5db67f6b6299004ee5a297df3eb94950645f74217944e47';
