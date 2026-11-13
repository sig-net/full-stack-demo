import { z } from 'zod'

import type { Event, EventDefinition } from '@/lib/event/event'
import type { EventConsumer } from '@/lib/event/event-consumer'
import type { Logger } from '@/lib/logging/logger'

/**
 * Adapts the event bus to a resolver: the resource's own lifecycle events nudge the resource
 * they name, and a child's terminal events nudge the parent they serve.
 */
export class LifecycleEventConsumer implements EventConsumer {
  private readonly config: LifecycleEventConsumerConfig

  constructor(config: LifecycleEventConsumerConfig) {
    this.config = config
  }

  wantsEvent(event: Event): boolean {
    return this.ownEvent(event) !== undefined || this.childParent(event) !== undefined
  }

  async handleEvent(event: Event): Promise<void> {
    const resource = this.resourceNamed(event)
    this.config.logger.debug('handling event', { event: event.type, eventId: event.id, resource })
    await this.config.resolve(resource)
  }

  /** The resource the event nudges: the one it names, or the parent a child's event serves. */
  private resourceNamed(event: Event): string {
    const own = this.ownEvent(event)
    if (own !== undefined) {
      const parsed = own.parse(event)
      if (!parsed.success) {
        throw new Error(`${event.type} ${event.id} is malformed: ${z.prettifyError(parsed.error)}`)
      }
      return parsed.data.name
    }
    const parent = this.childParent(event)
    if (parent === undefined) {
      throw new Error(`${event.type} ${event.id} does not name a ${this.config.resource}`)
    }
    return parent
  }

  private ownEvent(event: Event): EventDefinition<{ name: string }> | undefined {
    return this.config.ownEvents.find((definition) => definition.matches(event))
  }

  /** The parent a child's terminal event serves, or undefined when the event is not one or the parent is another resource. */
  private childParent(event: Event): string | undefined {
    const { children } = this.config
    if (children === undefined) return undefined
    for (const definition of children.terminalEvents) {
      if (!definition.matches(event)) continue
      const parsed = definition.parse(event)
      if (!parsed.success) return undefined
      return children.parentNameSchema.safeParse(parsed.data.parent).success
        ? parsed.data.parent
        : undefined
    }
    return undefined
  }
}

export interface LifecycleEventConsumerConfig {
  /** What the resource is called in the error for a child event that serves another resource. */
  readonly resource: string
  readonly ownEvents: readonly EventDefinition<{ name: string }>[]
  readonly children?: {
    readonly terminalEvents: readonly EventDefinition<{ name: string; parent: string }>[]
    /** Accepts the names of this resource, so a child under another resource is not wanted. */
    readonly parentNameSchema: z.ZodType<string>
  }
  readonly resolve: (name: string) => Promise<void>
  readonly logger: Logger
}
