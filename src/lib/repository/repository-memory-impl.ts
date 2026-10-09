import type { Criterion, Repository, SearchArgs } from '@/lib/repository/repository'

/**
 * A repository over a map, for tests and local runs without Postgres. It keeps and returns
 * copies, so a caller cannot change stored state through a reference, and it answers `search`
 * exactly as the SQL implementation does except that `lock` has nothing to lock.
 */
export class MemoryRepository<Resource extends { name: string }> implements Repository<Resource> {
  private readonly rows = new Map<string, Resource>()

  async create(resource: Resource): Promise<Resource> {
    if (this.rows.has(resource.name)) {
      throw new Error(`${resource.name} already exists`)
    }
    this.rows.set(resource.name, structuredClone(resource))
    return structuredClone(resource)
  }

  async get(name: string): Promise<Resource | undefined> {
    const row = this.rows.get(name)
    return row === undefined ? undefined : structuredClone(row)
  }

  async update(resource: Resource): Promise<Resource> {
    if (!this.rows.has(resource.name)) {
      throw new Error(`${resource.name} does not exist`)
    }
    this.rows.set(resource.name, structuredClone(resource))
    return structuredClone(resource)
  }

  async search(args: SearchArgs<Resource>): Promise<Resource[]> {
    const matches = [...this.rows.values()].filter((row) =>
      args.criteria.every((criterion) => holds(criterion, row)),
    )
    const order = args.order
    matches.sort((a, b) => {
      const byField = order === undefined ? 0 : compare(a[order.field], b[order.field])
      const signed = order?.direction === 'desc' ? -byField : byField
      return signed !== 0 ? signed : compare(a.name, b.name)
    })
    const limited = args.limit === undefined ? matches : matches.slice(0, args.limit)
    return limited.map((row) => structuredClone(row))
  }
}

function holds<Resource>(criterion: Criterion<Resource>, row: Resource): boolean {
  switch (criterion.type) {
    case 'exact-text':
      return row[criterion.field] === criterion.text
    case 'bool':
      return row[criterion.field] === criterion.bool
    default: {
      const unhandled: never = criterion
      throw new Error(`Unhandled criterion ${JSON.stringify(unhandled)}`)
    }
  }
}

/** Orders values the way Postgres orders the columns they are stored in, nulls last. */
function compare(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime()
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : 1
  if (
    (typeof a === 'bigint' || typeof a === 'number') &&
    (typeof b === 'bigint' || typeof b === 'number')
  ) {
    return a < b ? -1 : 1
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') return a ? 1 : -1
  throw new Error(`Cannot order ${typeof a} against ${typeof b}`)
}
