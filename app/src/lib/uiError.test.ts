import { describe, it, expect } from "vitest";
import {
  AlreadyClaimedError,
  CircleCancelledError,
  CircleNotFoundError,
  ContractError,
  InvalidInputError,
  InvalidProofError,
  OverflowError,
  ProvingError,
  RoundFullError,
  RoundNotFundedError,
  RpcError,
  WrongRoundTagError,
} from "@sharibo/client";
import { FriendbotRetryableError, FRIEND_BOT_RATE_LIMIT_MESSAGE } from "./friendbot";
import { getErrorMessage, toUiError } from "./uiError";

/** Stand-in for the i18n translator: returns the key so assertions are exact. */
const t = (key: string) => `t(${key})`;

describe("toUiError", () => {
  it("prefers specific copy for each typed contract error", () => {
    // Each subclass carries a real contract error code; the message is
    // arbitrary because the typed branch must win over it.
    const cases: [unknown, RegExp][] = [
      [new AlreadyClaimedError("Error(Contract, #4)"), /already been claimed/i],
      [new InvalidProofError("Error(Contract, #5)"), /proof is invalid/i],
      [new RoundNotFundedError("Error(Contract, #2)"), /not fully funded/i],
      [new WrongRoundTagError("Error(Contract, #3)"), /different round/i],
      [new CircleNotFoundError("Error(Contract, #1)"), /not found on-chain/i],
      [new RoundFullError("Error(Contract, #6)"), /already fully funded/i],
      [new OverflowError("Error(Contract, #7)"), /overflow/i],
      [new CircleCancelledError("Error(Contract, #8)"), /cancelled/i],
    ];

    for (const [error, expected] of cases) {
      expect(toUiError(error, t)).toMatch(expected);
    }
  });

  it("uses the base class message for an unrecognised ContractError", () => {
    const err = new ContractError("Error(Contract, #9)");
    expect(toUiError(err, t)).toBe("Error(Contract, #9)");
  });

  it("does not let the base classes swallow the specific copy", () => {
    // Regression guard: the typed branches must be checked before their bases.
    expect(toUiError(new RpcError("boom"), t)).not.toBe("boom");
    expect(toUiError(new ProvingError("boom"), t)).not.toBe("boom");
  });

  it("surfaces a network message for an RPC error", () => {
    expect(toUiError(new RpcError("socket hang up"), t)).toMatch(/network error/i);
  });

  it("passes InvalidInputError messages through", () => {
    const err = new InvalidInputError("size must be > 0");
    expect(toUiError(err, t)).toBe("size must be > 0");
  });

  it("falls back to the raw message for a plain Error", () => {
    expect(toUiError(new Error("kaboom"), t)).toBe("kaboom");
  });

  it("falls back to the translator for something that is not an Error at all", () => {
    expect(toUiError("just a string", t)).toBe("t(error.generic)");
    expect(toUiError(undefined, t)).toBe("t(error.generic)");
  });

  it("uses the friendbot rate-limit copy", () => {
    expect(toUiError(new FriendbotRetryableError(), t)).toBe(FRIEND_BOT_RATE_LIMIT_MESSAGE);
  });
});

describe("getErrorMessage", () => {
  it("uses the friendbot rate-limit copy too", () => {
    expect(getErrorMessage(new FriendbotRetryableError())).toBe(FRIEND_BOT_RATE_LIMIT_MESSAGE);
  });

  it("expands a raw on-chain rejection rather than echoing the code", () => {
    const msg = getErrorMessage(new ContractError("Error(Contract, #4)"));
    expect(msg).not.toBe("Error(Contract, #4)");
    expect(msg.length).toBeGreaterThan(0);
  });

  it("falls back to something usable for a plain Error", () => {
    expect(getErrorMessage(new Error("kaboom"))).toContain("kaboom");
  });
});
