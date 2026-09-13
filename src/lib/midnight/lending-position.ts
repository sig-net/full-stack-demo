import type { LendingPosition, MidnightTxRecord } from "./tx-history";

/**
 * Selects completed evidence belonging to the captured public position and token scales.
 *
 * @param records - Public operation evidence.
 * @param position - Identity, deployment and assets currently displayed.
 * @returns Only attributable completed lending records.
 */
export function attributedLendingHistory(
  records: readonly MidnightTxRecord[],
  position: LendingPosition,
): MidnightTxRecord[] {
  return records.filter((record) => {
    const scope = record.position;
    return (
      record.status === "completed" &&
      scope?.deploymentFingerprint === position.deploymentFingerprint &&
      (record.type === "Supply" || record.type === "Redeem") &&
      scope.commitment.toLowerCase() === position.commitment.toLowerCase() &&
      scope.midnightNetwork === position.midnightNetwork &&
      scope.chainId === position.chainId &&
      scope.vaultContract.toLowerCase() === position.vaultContract.toLowerCase() &&
      scope.assetToken.toLowerCase() === position.assetToken.toLowerCase() &&
      scope.shareToken.toLowerCase() === position.shareToken.toLowerCase() &&
      scope.assetDecimals === position.assetDecimals &&
      scope.shareDecimals === position.shareDecimals
    );
  });
}

/**
 * Reconciles exact shares before exposing net cash basis in asset base units.
 *
 * @param records - Already attributed completed lending records.
 * @param heldShares - Current authoritative share balance.
 * @returns Net asset cost, or null when evidence cannot account for the position.
 */
export function lendingNetCost(
  records: readonly MidnightTxRecord[],
  heldShares: bigint,
): bigint | null {
  let shares = 0n;
  let cost = 0n;
  let supplied = false;
  for (const record of records) {
    if (record.assetUnits === undefined || record.shareUnits === undefined) return null;
    const assets = BigInt(record.assetUnits);
    const units = BigInt(record.shareUnits);
    if (record.type === "Supply") {
      shares += units;
      cost += assets;
      supplied = true;
    } else if (record.type === "Redeem") {
      shares -= units;
      cost -= assets;
    }
  }
  return supplied && shares === heldShares ? cost : null;
}
