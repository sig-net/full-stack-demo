import { describe, expect, test } from 'vitest'

import {
  APPROVAL_NAME,
  approvalFixture,
  ERC20_ADDRESS,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-fixtures'
import type { ApprovalService } from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-service'
import { ApprovalServiceAdaptor } from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval-service-adaptor'
import { mock } from '@/lib/testing/mock'
import { RecordingLogger } from '@/lib/testing/recording-logger'

const CALLER_SECRET = 'ab'.repeat(32)
const WALLET = { coinPublicKey: `0x${'AA'.repeat(32)}`, encryptionPublicKey: 'bb'.repeat(32) }
const PARSED_WALLET = { coinPublicKey: 'aa'.repeat(32), encryptionPublicKey: 'bb'.repeat(32) }
const approval = approvalFixture()

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
      startApproval: recording(approval),
      completeApproval: recording(approval),
      getApproval: recording(approval),
      listApprovals: recording([approval]),
      ...service,
    }),
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
      name: 'startApproval of the router carries the token and normalises the wallet keys',
      call: (a) =>
        a.startApproval(CALLER_SECRET, {
          approvalRequest: { kind: 'router', erc20Address: ERC20_ADDRESS },
          wallet: WALLET,
        }),
      expectReceived: [
        { approvalRequest: { kind: 'router', erc20Address: ERC20_ADDRESS }, wallet: PARSED_WALLET },
      ],
    },
    {
      name: 'startApproval of the wrapper takes no token',
      call: (a) =>
        a.startApproval(CALLER_SECRET, { approvalRequest: { kind: 'stata' }, wallet: WALLET }),
      expectReceived: [{ approvalRequest: { kind: 'stata' }, wallet: PARSED_WALLET }],
    },
    {
      name: 'startApproval refuses a router approval without a token',
      call: (a) =>
        a.startApproval(CALLER_SECRET, { approvalRequest: { kind: 'router' }, wallet: WALLET }),
      expectReceived: [],
      expectError: 'erc20Address',
    },
    {
      name: 'completeApproval passes the name and the wallet',
      call: (a) => a.completeApproval(CALLER_SECRET, { name: APPROVAL_NAME, wallet: WALLET }),
      expectReceived: [{ name: APPROVAL_NAME, wallet: PARSED_WALLET }],
    },
    {
      name: 'completeApproval refuses a name that is not an approval',
      call: (a) => a.completeApproval(CALLER_SECRET, { name: 'approvals/1', wallet: WALLET }),
      expectReceived: [],
      expectError: 'expected callers/{caller}/ethereum-erc20-vault-approvals/{uuid}',
    },
    {
      name: 'listApprovalTargets takes no arguments',
      call: (a) => a.listApprovalTargets(CALLER_SECRET, {}),
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

  test("the deployer gate firing at build time is the vault's refusal", async () => {
    const adaptor = adaptorOver({
      startApproval: async () => {
        throw new Error('failed assert: Not the deployer')
      },
    })
    expect(
      await adaptor.startApproval(CALLER_SECRET, {
        approvalRequest: { kind: 'stata' },
        wallet: WALLET,
      }),
    ).toEqual({ ok: false, error: 'Not the deployer' })
  })
})
