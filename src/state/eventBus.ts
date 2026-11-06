import type { DomainEvent } from '../domain/types'

type EventHandler = (event: DomainEvent) => void
const handlers = new Map<string, Set<EventHandler>>()

export function subscribeToEvent(type: string, handler: EventHandler) {
  if (!handlers.has(type)) handlers.set(type, new Set())
  handlers.get(type)!.add(handler)
  return () => { handlers.get(type)?.delete(handler) }
}

export function publishToHandlers(event: DomainEvent) {
  for (const handler of [...(handlers.get(event.type) ?? []), ...(handlers.get('*') ?? [])]) handler(event)
}
