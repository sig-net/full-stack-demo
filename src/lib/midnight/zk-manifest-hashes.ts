// The sha256 of each zk asset tree's compiler/contract-manifest.json, as printed by
// `yarn zk-assets`. The zk config providers refuse an origin whose manifest hashes differently,
// so refresh both values whenever the vault or signet contract package changes.

/** `<origin>/compiler/contract-manifest.json`: the vault's 17 circuits. */
export const VAULT_ZK_MANIFEST_SHA256 =
  '7be79e00f140aeed029f46535b0b30a983d7eae6d279ae3f123aebc566942c6b';

/** `<origin>/signet/compiler/contract-manifest.json`: the signet contract the vault calls. */
export const SIGNET_ZK_MANIFEST_SHA256 =
  'd0ef716585d67bafa5db67f6b6299004ee5a297df3eb94950645f74217944e47';
