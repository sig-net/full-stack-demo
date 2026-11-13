import 'server-only'

import { eq, getTableColumns } from 'drizzle-orm'
import type { PgColumn, PgTable, TableConfig } from 'drizzle-orm/pg-core'
import type { z } from 'zod'

import type { DatabaseExecutor } from '@/lib/db/database'
import type { Repository, SearchArgs } from '@/lib/repository/repository'
import { SQLReadRepository } from '@/lib/repository/repository-sql-read-impl'

/**
 * A repository over one Drizzle table whose column properties are named exactly as the resource's
 * fields, so a criterion's field resolves to a column by name and the mappers convert values only.
 */
export class SQLRepository<Resource extends { name: string }, Table extends ResourceTable<Resource>>
  extends SQLReadRepository<Resource, Table['$inferSelect']>
  implements Repository<Resource>
{
  private readonly table: Table
  private readonly toRow: (resource: Resource) => Table['$inferInsert']

  constructor(
    database: DatabaseExecutor,
    table: Table,
    schema: z.ZodType<Resource>,
    toRow: (resource: Resource) => Table['$inferInsert'],
    fromRow: (row: Table['$inferSelect']) => Resource,
  ) {
    super(database, table, getTableColumns(table), schema, fromRow)
    this.table = table
    this.toRow = toRow
  }

  async create(resource: Resource): Promise<Resource> {
    const [stored] = await this.executor()
      .insert(this.anyTable())
      .values(this.toRow(resource))
      .returning()
    if (stored === undefined) {
      throw new Error('The insert returned no row')
    }
    return this.resource(stored)
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
    return this.resource(stored)
  }

  override async search(args: SearchArgs<Resource>): Promise<Resource[]> {
    let query = this.select(args)
    if (args.lock === 'update') query = query.for('update')
    if (args.lock === 'update-skip-locked') query = query.for('update', { skipLocked: true })
    return this.resources(await query)
  }

  /** Drizzle's query types resolve only against a concrete table type, so queries run on this. */
  private anyTable(): PgTable {
    return this.table
  }
}

/** A table with a column property for every field of the resource. */
export type ResourceTable<Resource> = PgTable<
  TableConfig & { columns: Record<keyof Resource & string, PgColumn> }
>
