/** Shared helpers for tests/server (WP-09). */
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach } from "vitest";
import type { DomainEvent } from "@/contracts";
import { resetEnvCache } from "@/env";
import { subscribe } from "@/server/events";
import { __resetStoreForTests } from "@/server/store";

export const BASE = "http://localhost/api";

export async function makeTmpDir(prefix = "ppp-store-"): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

/**
 * Points the process-wide store (DATA_DIR) at a fresh temp dir for every test and resets it,
 * so route handlers that import `store` from "@/server/store" run against an empty disk.
 */
export function useTmpDataDir(): { dir: () => string } {
  let dir = "";
  beforeEach(async () => {
    dir = await makeTmpDir();
    process.env.DATA_DIR = dir;
    delete process.env.SIM_START_DATE;
    resetEnvCache();
    __resetStoreForTests();
  });
  afterEach(async () => {
    __resetStoreForTests();
    await rm(dir, { recursive: true, force: true });
  });
  return { dir: () => dir };
}

/** Records every published DomainEvent until `stop()`. */
export function captureEvents(): { events: DomainEvent[]; types: () => string[]; stop: () => void } {
  const events: DomainEvent[] = [];
  const stop = subscribe((e) => {
    events.push(e);
  });
  return { events, types: () => events.map((e) => e.type), stop };
}

export function post(url: string, body?: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

export function get(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

export function ctx<P extends Record<string, string>>(params: P): { params: Promise<P> } {
  return { params: Promise.resolve(params) };
}
