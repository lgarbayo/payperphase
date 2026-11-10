/** Thrown by engine operations that must never silently produce a wrong plan. */
export type EngineErrorCode =
  | "UNKNOWN_PHASE"
  | "UNKNOWN_LINE"
  | "PHASE_PAID"
  | "PHASE_DELIVERED"
  | "SPLIT_LINE"
  | "EMPTY_PHASE"
  | "INVALID_MOVE"
  | "NO_LINES";

export class EngineError extends Error {
  readonly code: EngineErrorCode;
  readonly detail?: unknown;
  constructor(code: EngineErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = "EngineError";
    this.code = code;
    this.detail = detail;
  }
}
