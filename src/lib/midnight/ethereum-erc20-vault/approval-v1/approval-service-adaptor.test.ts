import { describe, expect, test } from 'vitest'

import { CALLER_CREDENTIAL, FIXTURE_NETWORK_ID } from '@/lib/caller/caller-fixtures'
import type {
  ApprovalCompleteInputs,
  ApprovalStartInputs,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval'
import {
  APPROVAL_NAME,
  approvalFixture,
  ERC20_ADDRESS,
  USER_COMMITMENT,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-fixtures'
import type { ApprovalService } from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-service'
import {
  type ApprovalResult,
  ApprovalServiceAdaptor,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-service-adaptor'
import { ApprovalStateConflict } from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-state-controller'
import {
  ATTESTATION_FIELDS,
  REQUEST_ID_HEX,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'
import { mock } from '@/lib/testing/mock'
import { RecordingLogger } from '@/lib/testing/recording-logger'

const approval = approvalFixture()
const ROUTER_REQUEST = { kind: 'router', erc20Address: ERC20_ADDRESS } as const
const STATA_REQUEST = { kind: 'stata' } as const
const FINALIZED_TX = `0x${'F1A1'.repeat(2)}`
const PARSED_FINALIZED_TX = 'f1a1'.repeat(2)
const START_INPUTS: ApprovalStartInputs = { inIndex: 42n }
const COMPLETE_INPUTS: ApprovalCompleteInputs = {
  requestId: REQUEST_ID_HEX,
  attestationOutputKind: ATTESTATION_FIELDS.attestationOutputKind,
  attestationOutput: ATTESTATION_FIELDS.attestationOutput,
}

function adaptorOver(service: Partial<ApprovalService>, received: object[] = []) {
  const recording =
    <Result>(answer: Result) =>
    async (_caller: unknown, args: object): Promise<Result> => {
      received.push(args)
      return answer
    }
  return new ApprovalServiceAdaptor(
    mock<ApprovalService>('ApprovalService', {
      listApprovalTargets: recording([]),
      prepareStartApproval: recording(START_INPUTS),
      startApproval: recording(approval),
      prepareCompleteApproval: recording(COMPLETE_INPUTS),
      completeApproval: recording(approval),
      getApproval: recording(approval),
      listApprovals: recording([approval]),
      ...service,
    }),
    FIXTURE_NETWORK_ID,
    new RecordingLogger(),
  )
}

describe('ApprovalServiceAdaptor parsing', () => {
  const cases: ReadonlyArray<{
    name: string
    call: (adaptor: ApprovalServiceAdaptor) => Promise<{ ok: boolean }>
    expectReceived: object[]
    expectError?: string
  }> = [
    {
      name: 'listApprovalTargets takes no arguments',
      call: (a) => a.listApprovalTargets(CALLER_CREDENTIAL, {}),
      expectReceived: [{}],
    },
    {
      name: 'prepareStartApproval of the router carries the token',
      call: (a) => a.prepareStartApproval(CALLER_CREDENTIAL, { approvalRequest: ROUTER_REQUEST }),
      expectReceived: [{ approvalRequest: ROUTER_REQUEST }],
    },
    {
      name: 'prepareStartApproval of the wrapper takes no token',
      call: (a) => a.prepareStartApproval(CALLER_CREDENTIAL, { approvalRequest: STATA_REQUEST }),
      expectReceived: [{ approvalRequest: STATA_REQUEST }],
    },
    {
      name: 'prepareStartApproval refuses a router approval without a token',
      call: (a) =>
        a.prepareStartApproval(CALLER_CREDENTIAL, { approvalRequest: { kind: 'router' } }),
      expectReceived: [],
      expectError: 'erc20Address',
    },
    {
      name: 'startApproval of the router carries the request, the slot and the finalised bytes normalised',
      call: (a) =>
        a.startApproval(CALLER_CREDENTIAL, {
          approvalRequest: ROUTER_REQUEST,
          userCommitment: USER_COMMITMENT,
          inIndex: '42',
          finalizedTx: FINALIZED_TX,
        }),
      expectReceived: [
        {
          approvalRequest: ROUTER_REQUEST,
          userCommitment: USER_COMMITMENT,
          inIndex: 42n,
          finalizedTx: PARSED_FINALIZED_TX,
        },
      ],
    },
    {
      name: 'startApproval of the wrapper carries the request, the slot and the finalised bytes',
      call: (a) =>
        a.startApproval(CALLER_CREDENTIAL, {
          approvalRequest: STATA_REQUEST,
          userCommitment: USER_COMMITMENT,
          inIndex: 42n,
          finalizedTx: FINALIZED_TX,
        }),
      expectReceived: [
        {
          approvalRequest: STATA_REQUEST,
          userCommitment: USER_COMMITMENT,
          inIndex: 42n,
          finalizedTx: PARSED_FINALIZED_TX,
        },
      ],
    },
    {
      name: 'startApproval refuses a router approval without a token',
      call: (a) =>
        a.startApproval(CALLER_CREDENTIAL, {
          approvalRequest: { kind: 'router' },
          userCommitment: USER_COMMITMENT,
          inIndex: 42n,
          finalizedTx: FINALIZED_TX,
        }),
      expectReceived: [],
      expectError: 'erc20Address',
    },
    {
      name: 'startApproval refuses finalised bytes that are not hex',
      call: (a) =>
        a.startApproval(CALLER_CREDENTIAL, {
          approvalRequest: STATA_REQUEST,
          userCommitment: USER_COMMITMENT,
          inIndex: 42n,
          finalizedTx: 'zz',
        }),
      expectReceived: [],
      expectError: 'finalizedTx',
    },
    {
      name: 'startApproval refuses a missing slot',
      call: (a) =>
        a.startApproval(CALLER_CREDENTIAL, {
          approvalRequest: STATA_REQUEST,
          finalizedTx: FINALIZED_TX,
        }),
      expectReceived: [],
      expectError: 'inIndex',
    },
    {
      name: 'prepareCompleteApproval passes the name',
      call: (a) => a.prepareCompleteApproval(CALLER_CREDENTIAL, { name: APPROVAL_NAME }),
      expectReceived: [{ name: APPROVAL_NAME }],
    },
    {
      name: 'completeApproval passes the name and the finalised bytes',
      call: (a) =>
        a.completeApproval(CALLER_CREDENTIAL, { name: APPROVAL_NAME, finalizedTx: FINALIZED_TX }),
      expectReceived: [{ name: APPROVAL_NAME, finalizedTx: PARSED_FINALIZED_TX }],
    },
    {
      name: 'completeApproval refuses a name that is not an approval',
      call: (a) =>
        a.completeApproval(CALLER_CREDENTIAL, { name: 'approvals/1', finalizedTx: FINALIZED_TX }),
      expectReceived: [],
      expectError: 'expected callers/{caller}/ethereum-erc20-vault-approvals/{uuid}',
    },
    {
      name: 'getApproval passes the name',
      call: (a) => a.getApproval(CALLER_CREDENTIAL, { name: APPROVAL_NAME }),
      expectReceived: [{ name: APPROVAL_NAME }],
    },
    {
      name: 'listApprovals takes no arguments',
      call: (a) => a.listApprovals(CALLER_CREDENTIAL, {}),
      expectReceived: [{}],
    },
  ]

  test.each(cases)('$name', async ({ call, expectReceived, expectError }) => {
    const received: object[] = []
    const result = await call(adaptorOver({}, received))
    expect(received).toEqual(expectReceived)
    if (expectError === undefined) expect(result.ok).toBe(true)
    else expect(result).toMatchObject({ ok: false, error: expect.stringContaining(expectError) })
  })
})

describe('ApprovalServiceAdaptor outcomes', () => {
  test('a missing approval is a not-found result', async () => {
    const adaptor = adaptorOver({ getApproval: async () => undefined })
    expect(await adaptor.getApproval(CALLER_CREDENTIAL, { name: APPROVAL_NAME })).toEqual({
      ok: false,
      error: `${APPROVAL_NAME} was not found.`,
    })
  })

  test('the prepare methods answer with the inputs the service assigned or read', async () => {
    const adaptor = adaptorOver({})
    expect(
      await adaptor.prepareStartApproval(CALLER_CREDENTIAL, { approvalRequest: STATA_REQUEST }),
    ).toEqual({ ok: true, inputs: START_INPUTS })
    expect(
      await adaptor.prepareCompleteApproval(CALLER_CREDENTIAL, { name: APPROVAL_NAME }),
    ).toEqual({
      ok: true,
      inputs: COMPLETE_INPUTS,
    })
  })

  const refusals: ReadonlyArray<[string, Error, ApprovalResult | undefined]> = [
    [
      'a state conflict',
      new ApprovalStateConflict(APPROVAL_NAME, 'AwaitingVaultRequest', 'complete'),
      {
        ok: false,
        error: `${APPROVAL_NAME} is AwaitingVaultRequest, which does not allow complete`,
      },
    ],
    ['any other error', new Error('indexer down'), undefined],
  ]

  test.each(refusals)('%s from a deployer action', async (_name, error, expectRefusal) => {
    const refusing = async () => {
      throw error
    }
    const adaptor = adaptorOver({
      startApproval: refusing,
      prepareCompleteApproval: refusing,
      completeApproval: refusing,
    })
    const starting = adaptor.startApproval(CALLER_CREDENTIAL, {
      approvalRequest: STATA_REQUEST,
      userCommitment: USER_COMMITMENT,
      inIndex: 42n,
      finalizedTx: FINALIZED_TX,
    })
    const preparing = adaptor.prepareCompleteApproval(CALLER_CREDENTIAL, { name: APPROVAL_NAME })
    const completing = adaptor.completeApproval(CALLER_CREDENTIAL, {
      name: APPROVAL_NAME,
      finalizedTx: FINALIZED_TX,
    })
    for (const outcome of [starting, preparing, completing]) {
      if (expectRefusal === undefined) await expect(outcome).rejects.toThrow(error.message)
      else expect(await outcome).toEqual(expectRefusal)
    }
  })
})
