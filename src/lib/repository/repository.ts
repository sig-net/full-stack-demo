/**
 * Durable storage of one resource kind, keyed by resource name. A repository is a typed driver:
 * it stores and finds resources and holds no application logic, so every repository has exactly
 * these members. Every method runs on the transaction open on its call chain, if there is one.
 */
export interface Repository<Resource extends { name: string }> {
  /** Inserts the resource and fails when a resource of that name exists. */
  create(resource: Resource): Promise<Resource>
  get(name: string): Promise<Resource | undefined>
  /** Replaces the stored resource of the same name and fails when there is none. */
  update(resource: Resource): Promise<Resource>
  search(args: SearchArgs<Resource>): Promise<Resource[]>
}

export interface SearchArgs<Resource> {
  /** Every criterion must hold. */
  criteria: Criterion<Resource>[]
  order?: { field: keyof Resource & string; direction: 'asc' | 'desc' }
  limit?: number
  /**
   * Locks the matches for the open transaction: `update` waits for a row another transaction
   * holds, `update-skip-locked` leaves it out.
   */
  lock?: 'update' | 'update-skip-locked'
}

export type Criterion<Resource> =
  | { type: 'exact-text'; field: keyof Resource & string; text: string }
  | { type: 'bool'; field: keyof Resource & string; bool: boolean }
