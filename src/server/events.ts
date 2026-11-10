/**
 * OWNED BY WP-09. In-process domain event bus (survives Next dev HMR via globalThis).
 * SCAFFOLD STUB: working minimal implementation; WP-09 may extend (history buffer, filters).
 */
import { EventEmitter } from "node:events";
import type { DomainEvent, DomainEventInput } from "@/contracts/events";
import { SIM_DEFAULT_START } from "@/contracts/constants";

type Listener = (e: DomainEvent) => void;
const g = globalThis as unknown as { __pppBus?: EventEmitter; __pppSimToday?: string };
const bus = (g.__pppBus ??= new EventEmitter().setMaxListeners(200));

/** The store keeps this in sync with the simulated clock so events carry simToday. */
export function setEventSimToday(today: string): void {
  g.__pppSimToday = today;
}

export function publish(input: DomainEventInput): DomainEvent {
  const event = {
    ...input,
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    simToday: g.__pppSimToday ?? SIM_DEFAULT_START,
  } as DomainEvent;
  bus.emit("event", event);
  return event;
}

/** Returns an unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  bus.on("event", listener);
  return () => bus.off("event", listener);
}
