import 'server-only'

import { and, asc, desc, eq, getTableColumns, type SQL } from 'drizzle-orm'
import type { PgColumn, PgTable, TableConfig } from 'drizzle-orm/pg-core'

import type { DatabaseExecutor } from '@/lib/db/database'
import { currentTransaction } from '@/lib/db/unit-of-work'
import type { Criterion, Repository, SearchArgs } from '@/lib/repository/repository'

/**
 * A repository over one Drizzle table whose column properties are named exactly as the resource's
 * fields, so a criterion's field resolves to a column by name and the mappers convert values only.
 */
export class SQLRepository<
  Resource extends { name: string },
  Table extends ResourceTable<Resource>,
> implements Repository<Resource> {
  private readonly database: DatabaseExecutor
  private readonly table: Table
  private readonly toRow: (resource: Resource) => Table['$inferInsert']
  private readonly fromRow: (row: Table['$inferSelect']) => Resource

  constructor(
    database: DatabaseExecutor,
    table: Table,
    toRow: (resource: Resource) => Table['$inferInsert'],
    fromRow: (row: Table['$inferSelect']) => Resource,
  ) {
    this.database = database
    this.table = table
    this.toRow = toRow
    this.fromRow = fromRow
  }

  async create(resource: Resource): Promise<Resource> {
    const [stored] = await this.executor()
      .insert(this.anyTable())
      .values(this.toRow(resource))
      .returning()
    if (stored === undefined) {
      throw new Error('The insert returned no row')
    }
    return this.fromRow(this.typedRow(stored))
  }

  async get(name: string): Promise<Resource | undefined> {
    const [row] = await this.executor()
      .select()
      .from(this.anyTable())
      .where(eq(this.column('name'), name))
      .limit(1)
    return row === undefined ? undefined : this.fromRow(this.typedRow(row))
  }

  async update(resource: Resource): Promise<Resource> {
    const [stored] = await this.executor()
      .update(this.anyTable())
      .set(this.toRow(resource))
      .where(eq(this.column('name'), resource.name))
      .returning()
    if (stored === undefined) {
      throw new Error(`${resource.name} does not exist`)
    }
    return this.fromRow(this.typedRow(stored))
  }

  async search(args: SearchArgs<Resource>): Promise<Resource[]> {
    let query = this.executor()
      .select()
      .from(this.anyTable())
      .where(and(...args.criteria.map((criterion) => this.condition(criterion))))
      .$dynamic()
    if (args.order !== undefined) {
      const direction = args.order.direction === 'asc' ? asc : desc
      query = query.orderBy(direction(this.column(args.order.field)), asc(this.column('name')))
    }
    if (args.limit !== undefined) query = query.limit(args.limit)
    if (args.lock === 'update-skip-locked') query = query.for('update', { skipLocked: true })
    const rows = await query
    return rows.map((row) => this.fromRow(this.typedRow(row)))
  }

  private executor(): DatabaseExecutor {
    return currentTransaction() ?? this.database
  }

  /** Drizzle's query types resolve only against a concrete table type, so queries run on this. */
  private anyTable(): PgTable {
    return this.table
  }

  /**
   * Every row selected from the table has the table's select shape, which the query type dropped:
   * Drizzle's select, insert and returning types branch on conditionals over the table parameter,
   * which TypeScript cannot resolve while the parameter is generic.
   */
  private typedRow(row: PgTable['$inferSelect']): Table['$inferSelect'] {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return row as Table['$inferSelect']
  }

  private column(field: keyof Resource & string): PgColumn {
    return getTableColumns(this.table)[field]
  }

  private condition(criterion: Criterion<Resource>): SQL {
    switch (criterion.type) {
      case 'exact-text':
        return eq(this.column(criterion.field), criterion.text)
      case 'bool':
        return eq(this.column(criterion.field), criterion.bool)
      default: {
        const unhandled: never = criterion
        throw new Error(`Unhandled criterion ${JSON.stringify(unhandled)}`)
      }
    }
  }
}

/** A table with a column property for every field of the resource. */
export type ResourceTable<Resource> = PgTable<
  TableConfig & { columns: Record<keyof Resource & string, PgColumn> }
>
