import type { CallerOperationState } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation'
import type { Backend } from '@/server/backend'

import type { UserWallet } from './user-wallet'

const POLL_EVERY_MS = 5_000

/** A caller operation as the round trip drives it: where it stands, and the completion its type offers. */
export interface DrivenOperation {
  readonly name: string
  readonly state: () => Promise<CallerOperationState | undefined>
  readonly complete: () => Promise<{ ok: true } | { ok: false; error: string }>
}

/**
 * Plays the user's wallet for an operation until it completes: every caller call in
 * `AwaitingWallet` is balanced and submitted, and the completion is asked for once the
 * operation awaits it. A failed completion attempt is left to the sweep's ledger check and
 * asked for again, as the page does.
 */
export async function driveOperation(
  backend: Backend,
  callerSecret: string,
  user: UserWallet,
  operation: DrivenOperation,
  timeoutMs: number,
): Promise<void> {
  const transactions = backend.midnight.transactionV1.adaptor
  const submitted = new Set<string>()
  const deadline = Date.now() + timeoutMs
  let completionAskedAt = 0
  let lastState: CallerOperationState | undefined
  while (Date.now() < deadline) {
    const live = await transactions.listTransactions(callerSecret, { parent: operation.name })
    if (!live.ok) throw new Error(live.error)
    for (const transaction of live.transactions) {
      if (
        transaction.state !== 'AwaitingWallet' ||
        transaction.signer !== 'caller' ||
        transaction.unboundTx === null ||
        submitted.has(transaction.name)
      ) {
        continue
      }
      submitted.add(transaction.name)
      const finalizedTx = await user.balance(transaction.unboundTx)
      const result = await transactions.submitTransaction(callerSecret, {
        name: transaction.name,
        finalizedTx,
      })
      if (!result.ok) throw new Error(result.error)
      log(`${shortName(operation.name)}: balanced and submitted ${transaction.circuit}`)
    }
    const state = await operation.state()
    if (state !== lastState) {
      log(`${shortName(operation.name)}: ${state ?? 'missing'}`)
      lastState = state
    }
    if (state === 'Completed') return
    if (state === 'Failed') throw new Error(`${operation.name} failed`)
    if (state === 'AwaitingCompletion' && Date.now() - completionAskedAt > COMPLETION_RETRY_MS) {
      completionAskedAt = Date.now()
      const completing = await operation.complete()
      log(
        `${shortName(operation.name)}: completion ${completing.ok ? 'accepted' : `refused: ${completing.error}`}`,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_EVERY_MS))
  }
  throw new Error(`${operation.name} did not complete within ${String(timeoutMs)} ms`)
}

/** Past one sweep interval, so the resolver's ledger check runs before a completion is asked for again. */
const COMPLETION_RETRY_MS = 40_000

/** Deletes an operation's row and every child under it, the outbox included, so a run leaves nothing behind. */
export async function deleteOperation(
  backend: Backend,
  table: string,
  name: string,
): Promise<void> {
  const { pool } = backend.db
  const requests = await pool.query<{ name: string }>(
    'select name from midnight_ethereum_erc20_vault_requests_v1 where parent = $1',
    [name],
  )
  const parents = [name, ...requests.rows.map((row) => row.name)]
  for (const childTable of ['midnight_transactions_v1', 'ethereum_transactions_v1']) {
    await pool.query(`delete from ${childTable} where parent = any($1)`, [parents])
  }
  await pool.query('delete from midnight_ethereum_erc20_vault_requests_v1 where parent = $1', [
    name,
  ])
  await pool.query(`delete from ${table} where name = $1`, [name])
  await pool.query("delete from event_outbox_entries_v1 where convert_from(data, 'UTF8') like $1", [
    `%${name}%`,
  ])
}

export function shortName(name: string): string {
  return name.slice(-8)
}

export function log(message: string): void {
  console.log(`${new Date().toISOString()} ${message}`)
}
