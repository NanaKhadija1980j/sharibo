// Bigint-safe JSON codec for the demo state persisted in sessionStorage.
//
// `JSON.stringify` throws a TypeError on a bare bigint ("Do not know how to
// serialize a BigInt"), and circle ids / pots / nullifier hashes are all
// bigints. The replacer encodes them as a marked string; the reviver decodes
// them back. The pair is only useful together — writing without the marker
// loses precision, reading without it yields strings where bigints belong —
// so they live in one module and are tested as a round trip.
//
// Extracted from App.tsx (see #508); the codec used to be defined inline next
// to the component that read sessionStorage.

export const BIGINT_MARKER = "BIGINT::";

/** `JSON.stringify` replacer: encodes bigint as a marked string. */
export function replacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return BIGINT_MARKER + value.toString();
  }
  return value;
}

/** `JSON.parse` reviver: decodes a marked string back into a bigint. */
export function reviver(_key: string, value: unknown): unknown {
  if (typeof value === "string" && value.startsWith(BIGINT_MARKER)) {
    return BigInt(value.slice(BIGINT_MARKER.length));
  }
  return value;
}

/** The sessionStorage key holding the "you left a circle behind" resume hint. */
export const SESSION_STATE_KEY = "sharibo_demo_state";

/**
 * Read the persisted demo state, or null when there is nothing to resume.
 *
 * A corrupt or unparseable blob is cleared rather than thrown: a stale
 * sessionStorage entry should never be able to wedge the app on boot.
 */
export function readSessionState(): Record<string, unknown> | null {
  if (typeof sessionStorage === "undefined") return null;

  const saved = sessionStorage.getItem(SESSION_STATE_KEY);
  if (!saved) return null;

  try {
    const parsed = JSON.parse(saved, reviver) as Record<string, unknown> | null;
    return parsed && parsed.circleId ? parsed : null;
  } catch {
    sessionStorage.removeItem(SESSION_STATE_KEY);
    return null;
  }
}

/** Persist demo state for the resume prompt, bigints included. */
export function writeSessionState(state: Record<string, unknown>): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(SESSION_STATE_KEY, JSON.stringify(state, replacer));
}

/** Drop any persisted demo state. */
export function clearSessionState(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(SESSION_STATE_KEY);
}
