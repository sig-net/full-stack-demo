import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { describe, expect, test } from 'vitest'

import { UnitOfWork } from '@/lib/db/unit-of-work'
import { mock } from '@/lib/testing/mock'
import { RecordingLogger } from '@/lib/testing/recording-logger'

type DatabaseTransaction = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0]

function unitOfWorkOver(logger: RecordingLogger): UnitOfWork {
  return new UnitOfWork(
    mock<NodePgDatabase>('NodePgDatabase', {
      transaction: (work) => work(mock<DatabaseTransaction>('DatabaseTransaction')),
    }),
    logger,
  )
}

const cases: ReadonlyArray<{
  name: string
  work: (unitOfWork: UnitOfWork) => Promise<string>
  expectResult?: string
  expectError?: string
  expectMessages: string[]
}> = [
  {
    name: 'a committed transaction logs its opening and its commit',
    work: (unitOfWork) => unitOfWork.runInTransaction(async () => 'done'),
    expectResult: 'done',
    expectMessages: ['transaction opened', 'transaction committed'],
  },
  {
    name: 'a failed transaction logs its rollback with the error and rethrows it',
    work: (unitOfWork) =>
      unitOfWork.runInTransaction(() => Promise.reject(new Error('constraint broke'))),
    expectError: 'constraint broke',
    expectMessages: ['transaction opened', 'transaction rolled back'],
  },
  {
    name: 'a call that joins an open transaction logs nothing of its own',
    work: (unitOfWork) =>
      unitOfWork.runInTransaction(() => unitOfWork.runInTransaction(async () => 'joined')),
    expectResult: 'joined',
    expectMessages: ['transaction opened', 'transaction committed'],
  },
]

describe('UnitOfWork.runInTransaction', () => {
  test.each(cases)('$name', async ({ work, expectResult, expectError, expectMessages }) => {
    const logger = new RecordingLogger()
    const running = work(unitOfWorkOver(logger))
    if (expectError === undefined) await expect(running).resolves.toBe(expectResult)
    else await expect(running).rejects.toThrow(expectError)
    expect(logger.lines.map((line) => line.message)).toEqual(expectMessages)
    expect(logger.at('debug')).toHaveLength(expectMessages.length)
    const [, closed] = logger.lines
    expect(closed?.fields.durationMs).toBeGreaterThanOrEqual(0)
    if (expectError !== undefined) expect(closed?.fields.err?.message).toBe(expectError)
  })
})
