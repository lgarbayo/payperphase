/**
 * In-process domain event bus (survives Next dev HMR via globalThis).
 *
 * - `publish` stamps id / wall-clock `at` / simulated `simToday` and fans out synchronously.
 *   Publishers call it AFTER persisting, so subscribers (the agent, SSE) always read fresh state.
 * - A throwing (or rejecting) subscriber is isolated: it never breaks the publisher's request.
 * - A bounded history lets SSE clients resume with `Last-Event-ID` after a reconnect.
 *
 * State lives on globalThis because Next may bundle instrumentation and route handlers separately.
 */
import { EventEmitter } from "node:events";
import { DomainEventSchema, type DomainEvent, type DomainEventInput } from "@/contracts/events";
import { SIM_DEFAULT_START } from "@/contracts/constants";

type Listener = (e: DomainEvent) => void | Promise<void>;

/** How many recent events are kept for `Last-Event-ID` replay. */
export const EVENT_HISTORY_SIZE = 200;

interface BusState {
  emitter: EventEmitter;
  simToday: string | undefined;
  history: DomainEvent[];
}

const g = globalThis as unknown as { __pppBus?: EventEmitter; __pppSimToday?: string; __pppBusState?: BusState };

function state(): BusState {
  if (!g.__pppBusState) {
    g.__pppBusState = {
      emitter: (g.__pppBus ??= new EventEmitter().setMaxListeners(500)),
      simToday: g.__pppSimToday,
      history: [],
    };
  }
  return g.__pppBusState;
}

/** The store keeps this in sync with the simulated clock so events carry simToday. */
export function setEventSimToday(today: string): void {
  state().simToday = today;
  g.__pppSimToday = today;
}

export function getEventSimToday(): string {
  return state().simToday ?? SIM_DEFAULT_START;
}

function report(err: unknown, event: DomainEvent): void {
  console.error(`[events] subscriber failed on ${event.type}:`, err);
}

export function publish(input: DomainEventInput): DomainEvent {
  const s = state();
  const event = {
    ...input,
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    simToday: getEventSimToday(),
  } as DomainEvent;
  const check = DomainEventSchema.safeParse(event);
  if (!check.success) {
    // Never break the demo path over a malformed event, but make it loud in logs.
    console.warn(`[events] ${event.type} does not match DomainEventSchema:`, check.error.issues);
  }
  s.history.push(event);
  if (s.history.length > EVENT_HISTORY_SIZE) s.history.splice(0, s.history.length - EVENT_HISTORY_SIZE);
  s.emitter.emit("event", event);
  return event;
}

/** Returns an unsubscribe function. Listener errors (sync or async) are logged, never rethrown. */
export function subscribe(listener: Listener): () => void {
  const wrapped = (e: DomainEvent) => {
    try {
      const out = listener(e);
      if (out && typeof (out as Promise<void>).catch === "function") (out as Promise<void>).catch((err) => report(err, e));
    } catch (err) {
      report(err, e);
    }
  };
  const { emitter } = state();
  emitter.on("event", wrapped);
  return () => {
    emitter.off("event", wrapped);
  };
}

/** Number of live subscribers (SSE connections + agent). Used by tests and diagnostics. */
export function listenerCount(): number {
  return state().emitter.listenerCount("event");
}

/**
 * Events published after `lastEventId`, oldest first. Returns null when the id is unknown
 * (too old or from a previous process), so the caller can tell the client to reload instead.
 */
export function eventsSince(lastEventId: string): DomainEvent[] | null {
  const { history } = state();
  const i = history.findIndex((e) => e.id === lastEventId);
  return i === -1 ? null : history.slice(i + 1);
}

/** Test helper: drop history (subscribers are left alone). */
export function clearEventHistory(): void {
  state().history.length = 0;
}
