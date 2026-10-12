import 'server-only'

import { and, asc, desc, eq, type SQL } from 'drizzle-orm'
import type { PgColumn, PgTable, PgView } from 'drizzle-orm/pg-core'
import type { z } from 'zod'

import type { DatabaseExecutor } from '@/lib/db/database'
import { currentTransaction } from '@/lib/db/unit-of-work'
import type { Criterion, ReadRepository, ReadSearchArgs } from '@/lib/repository/repository'

/**
 * A read-only repository over one Drizzle table or view whose column properties are named
 * exactly as the resource's fields. Every row read is parsed with the resource schema, since
 * stored rows are a trust boundary.
 */
export class SQLReadRepository<
  Resource extends { name: string },
  Row,
> implements ReadRepository<Resource> {
  private readonly database: DatabaseExecutor
  private readonly source: PgTable | PgView
  private readonly columns: Record<keyof Resource & string, PgColumn>
  private readonly schema: z.ZodType<Resource>
  private readonly fromRow: (row: Row) => Resource

  constructor(
    database: DatabaseExecutor,
    source: PgTable | PgView,
    columns: Record<keyof Resource & string, PgColumn>,
    schema: z.ZodType<Resource>,
    fromRow: (row: Row) => Resource,
  ) {
    this.database = database
    this.source = source
    this.columns = columns
    this.schema = schema
    this.fromRow = fromRow
  }

  async get(name: string): Promise<Resource | undefined> {
    const [row] = await this.executor()
      .select()
      .from(this.anySource())
      .where(eq(this.column('name'), name))
      .limit(1)
    return row === undefined ? undefined : this.resource(row)
  }

  async search(args: ReadSearchArgs<Resource>): Promise<Resource[]> {
    return this.resources(await this.select(args))
  }

  protected executor(): DatabaseExecutor {
    return currentTransaction() ?? this.database
  }

  /** The criteria, order and limit as one query, for a subclass to lock before it runs. */
  protected select(args: ReadSearchArgs<Resource>) {
    let query = this.executor()
      .select()
      .from(this.anySource())
      .where(and(...args.criteria.map((criterion) => this.condition(criterion))))
      .$dynamic()
    if (args.order !== undefined) {
      const direction = args.order.direction === 'asc' ? asc : desc
      query = query.orderBy(direction(this.column(args.order.field)), asc(this.column('name')))
    }
    if (args.limit !== undefined) query = query.limit(args.limit)
    return query
  }

  protected resources(rows: Record<string, unknown>[]): Resource[] {
    return rows.map((row) => this.resource(row))
  }

  protected resource(row: Record<string, unknown>): Resource {
    return this.schema.parse(this.fromRow(this.typedRow(row)))
  }

  protected column(field: keyof Resource & string): PgColumn {
    return this.columns[field]
  }

  /** Drizzle's query types resolve only against a concrete source type, so queries run on this. */
  private anySource(): PgTable | PgView {
    return this.source
  }

  /**
   * Every row selected from the source has the source's select shape, which the query type
   * dropped: Drizzle's select and returning types branch on conditionals over the source
   * parameter, which TypeScript cannot resolve while the parameter is generic.
   */
  private typedRow(row: Record<string, unknown>): Row {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return row as Row
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
