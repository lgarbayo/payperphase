/**
 * Loads the real Bryntum Gantt module under jsdom. Bryntum probes `matchMedia` and
 * `ResizeObserver` at import time; jsdom has neither, so we stub them before the dynamic import.
 */
export async function loadBryntum() {
  const g = globalThis as Record<string, unknown>;
  g.matchMedia ??= (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  });
  g.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  return import("@bryntum/gantt");
}
