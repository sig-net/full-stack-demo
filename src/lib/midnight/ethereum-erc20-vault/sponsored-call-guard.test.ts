import { describe, expect, test } from 'vitest'

import {
  SPONSORED_CALL_POLICY_BY_CIRCUIT,
  type SponsoredCircuit,
  SponsoredCallGuard,
  SponsoredCallMismatch,
} from '@/lib/midnight/ethereum-erc20-vault/sponsored-call-guard'
import type {
  BoundContractAction,
  BoundTransactionContents,
} from '@/lib/midnight/transaction-v1/inspect-bound-transaction'

const VAULT_ADDRESS = '33'.repeat(32)
const BOUND_TX = 'b0bd'
/** Which circuits may spend shielded coins, stated apart from the policy table so a changed policy fails here. */
const SHIELDED_SPEND_ADMITTED: Readonly<Record<SponsoredCircuit, boolean>> = {
  startDeposit: false,
  completeDeposit: false,
  startWithdraw: true,
  completeWithdraw: false,
  startSupply: true,
  completeSupply: false,
  startRedeem: true,
  completeRedeem: false,
}
const SPONSORED_CIRCUITS: readonly SponsoredCircuit[] = [
  'startDeposit',
  'completeDeposit',
  'startWithdraw',
  'completeWithdraw',
  'startSupply',
  'completeSupply',
  'startRedeem',
  'completeRedeem',
]

const vaultCall = (circuit: string): BoundContractAction => ({
  kind: 'call',
  address: VAULT_ADDRESS,
  entryPoint: circuit,
})

/** Bound bytes holding the given actions and otherwise nothing. */
const contentsOf = (
  actions: BoundContractAction[],
  coins: Partial<Omit<BoundTransactionContents, 'actions'>> = {},
): BoundTransactionContents => ({
  actions,
  shieldedInputs: 0,
  shieldedTransients: 0,
  shieldedOutputs: 0,
  unshieldedOffers: 0,
  dustActions: false,
  ...coins,
})

/** What the real bound bytes of each circuit carry, observed on the local stack. */
const realBytes: ReadonlyArray<{ circuit: SponsoredCircuit; contents: BoundTransactionContents }> =
  [
    { circuit: 'startDeposit', contents: contentsOf([vaultCall('startDeposit')]) },
    {
      circuit: 'completeDeposit',
      contents: contentsOf([vaultCall('completeDeposit')], { shieldedOutputs: 1 }),
    },
    {
      circuit: 'startWithdraw',
      contents: contentsOf([vaultCall('startWithdraw')], {
        shieldedInputs: 2,
        shieldedTransients: 1,
        shieldedOutputs: 2,
      }),
    },
    { circuit: 'completeWithdraw', contents: contentsOf([vaultCall('completeWithdraw')]) },
    {
      circuit: 'completeWithdraw',
      contents: contentsOf([vaultCall('completeWithdraw')], { shieldedOutputs: 1 }),
    },
    // The input count follows the wallet's coin selection: one coin here, two in the withdraw rows.
    {
      circuit: 'startSupply',
      contents: contentsOf([vaultCall('startSupply')], {
        shieldedInputs: 1,
        shieldedTransients: 1,
        shieldedOutputs: 2,
      }),
    },
    {
      circuit: 'startRedeem',
      contents: contentsOf([vaultCall('startRedeem')], {
        shieldedInputs: 1,
        shieldedTransients: 1,
        shieldedOutputs: 2,
      }),
    },
  ]

/** Bytes every sponsored circuit refuses, whatever its policy. */
const refusedByEvery = (
  circuit: SponsoredCircuit,
): ReadonlyArray<{ name: string; contents: BoundTransactionContents | undefined }> => {
  const other = SPONSORED_CIRCUITS.find((candidate) => candidate !== circuit) ?? circuit
  return [
    { name: 'bytes that are not a bound transaction', contents: undefined },
    { name: 'a transaction with no contract action', contents: contentsOf([]) },
    {
      name: 'two vault calls',
      contents: contentsOf([vaultCall(circuit), vaultCall(circuit)]),
    },
    {
      name: 'a call to another contract',
      contents: contentsOf([{ kind: 'call', address: '44'.repeat(32), entryPoint: circuit }]),
    },
    { name: 'a call to another vault circuit', contents: contentsOf([vaultCall(other)]) },
    {
      name: 'a deploy',
      contents: contentsOf([{ kind: 'deploy', address: VAULT_ADDRESS }]),
    },
    {
      name: 'a maintenance update',
      contents: contentsOf([{ kind: 'maintenance-update', address: VAULT_ADDRESS }]),
    },
    {
      name: 'the call with an unshielded offer',
      contents: contentsOf([vaultCall(circuit)], { unshieldedOffers: 1 }),
    },
    {
      name: 'the call with a DUST action',
      contents: contentsOf([vaultCall(circuit)], { dustActions: true }),
    },
    {
      name: 'the call with a DUST action beside shielded inputs',
      contents: contentsOf([vaultCall(circuit)], {
        shieldedInputs: 2,
        shieldedTransients: 1,
        shieldedOutputs: 2,
        dustActions: true,
      }),
    },
  ]
}

/** Bytes a circuit that takes no coin refuses and one that surrenders a coin admits. */
const shieldedSpends: ReadonlyArray<{ name: string; contents: BoundTransactionContents }> = [
  { name: 'a shielded input', contents: contentsOf([], { shieldedInputs: 1 }) },
  { name: 'a shielded transient', contents: contentsOf([], { shieldedTransients: 1 }) },
  {
    name: 'shielded inputs with their change',
    contents: contentsOf([], { shieldedInputs: 3, shieldedOutputs: 1 }),
  },
]

function guardOver(contents: BoundTransactionContents | undefined): SponsoredCallGuard {
  return new SponsoredCallGuard(VAULT_ADDRESS, (boundTx) => {
    expect(boundTx).toBe(BOUND_TX)
    return contents
  })
}

describe('SponsoredCallGuard.assertSponsoredCall', () => {
  test('the policy table holds exactly the circuits this test states a policy for', () => {
    expect(SPONSORED_CIRCUITS.length).toBeGreaterThan(0)
    expect(Object.keys(SPONSORED_CALL_POLICY_BY_CIRCUIT).sort()).toEqual(
      [...SPONSORED_CIRCUITS].sort(),
    )
  })

  test.each(realBytes)('admits the real bound bytes of $circuit', ({ circuit, contents }) => {
    expect(() => guardOver(contents).assertSponsoredCall(BOUND_TX, circuit)).not.toThrow()
  })

  test.each(
    SPONSORED_CIRCUITS.flatMap((circuit) =>
      refusedByEvery(circuit).map((refused) => ({ circuit, ...refused })),
    ),
  )('refuses $name for $circuit', ({ circuit, contents }) => {
    const asserting = () => guardOver(contents).assertSponsoredCall(BOUND_TX, circuit)
    expect(asserting).toThrow(SponsoredCallMismatch)
    expect(asserting).toThrow(`the bound bytes must be exactly one ${circuit} call to the vault`)
  })

  test.each(
    SPONSORED_CIRCUITS.flatMap((circuit) =>
      shieldedSpends.map(({ name, contents }) => ({
        circuit,
        name,
        contents: { ...contents, actions: [vaultCall(circuit)] },
        admitted: SHIELDED_SPEND_ADMITTED[circuit],
      })),
    ),
  )('$circuit with $name: admitted $admitted', ({ circuit, contents, admitted }) => {
    const asserting = () => guardOver(contents).assertSponsoredCall(BOUND_TX, circuit)
    if (admitted) {
      expect(asserting).not.toThrow()
    } else {
      expect(asserting).toThrow('spending no coins')
    }
  })

  test('the message of a circuit that surrenders a coin names the shielded spend it admits', () => {
    expect(new SponsoredCallMismatch('startWithdraw').message).toBe(
      'the bound bytes must be exactly one startWithdraw call to the vault, spending shielded coins alone',
    )
  })
})
