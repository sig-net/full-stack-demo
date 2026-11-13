/** The withdrawal's transitions are the caller operation's: `caller-operation-state-machine.ts` holds the table. */
export {
  assertConsistent,
  type CallerOperationStateAction as WithdrawStateAction,
  INITIAL_STATE,
  nextState,
} from '@/lib/midnight/ethereum-erc20-vault/caller-operation/caller-operation-state-machine'
