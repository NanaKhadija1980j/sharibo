import { describe, it, expect, beforeEach } from "vitest";
import {
  BIGINT_MARKER,
  SESSION_STATE_KEY,
  clearSessionState,
  readSessionState,
  replacer,
  reviver,
  writeSessionState,
} from "./session";

describe("bigint JSON codec", () => {
  it("round-trips a bigint without losing precision", () => {
    // The point of the marker: a bare bigint survives JSON at all.
    const circleId = 1234567890123456789012345678901234567890n;
    const text = JSON.stringify({ circleId }, replacer);
    expect(JSON.parse(text, reviver)).toEqual({ circleId });
  });

  it("encodes as a marked string, not a number", () => {
    const text = JSON.stringify({ n: 7n }, replacer);
    expect(text).toBe(`{"n":"${BIGINT_MARKER}7"}`);
  });

  it("leaves ordinary values untouched", () => {
    const value = { a: 1, b: "two", c: null, d: [3], e: true };
    const text = JSON.stringify(value, replacer);
    expect(JSON.parse(text, reviver)).toEqual(value);
  });

  it("leaves a string that merely looks like a bigint alone", () => {
    // Only an exact marker prefix decodes; otherwise a legitimate user string
    // would be silently turned into a BigInt (and could throw).
    const text = JSON.stringify({ note: "BIGINT-ish but not marked" }, replacer);
    expect(JSON.parse(text, reviver).note).toBe("BIGINT-ish but not marked");
  });

  it("handles a bigint nested in an array", () => {
    const text = JSON.stringify([1n, 2n, 3n], replacer);
    expect(JSON.parse(text, reviver)).toEqual([1n, 2n, 3n]);
  });
});

describe("session state", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("returns null when nothing is stored", () => {
    expect(readSessionState()).toBeNull();
  });

  it("round-trips a circle id through sessionStorage", () => {
    writeSessionState({ circleId: 42n, note: "hello" });
    expect(sessionStorage.getItem(SESSION_STATE_KEY)).toBeTruthy();
    expect(readSessionState()).toEqual({ circleId: 42n, note: "hello" });
  });

  it("ignores an entry with no circle id", () => {
    // Not resumable, so it should not be offered as something to resume.
    sessionStorage.setItem(SESSION_STATE_KEY, JSON.stringify({ note: "no circle" }));
    expect(readSessionState()).toBeNull();
  });

  it("clears a corrupt entry instead of throwing", () => {
    sessionStorage.setItem(SESSION_STATE_KEY, "{not json");
    expect(() => readSessionState()).not.toThrow();
    expect(readSessionState()).toBeNull();
    expect(sessionStorage.getItem(SESSION_STATE_KEY)).toBeNull();
  });

  it("clears on demand", () => {
    writeSessionState({ circleId: 1n });
    clearSessionState();
    expect(sessionStorage.getItem(SESSION_STATE_KEY)).toBeNull();
  });
});
