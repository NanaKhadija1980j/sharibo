import {
  ContractError,
  RpcError,
  ProvingError,
  InvalidInputError,
  AlreadyClaimedError,
  InvalidProofError,
  RoundNotFundedError,
  WrongRoundTagError,
  CircleNotFoundError,
  RoundFullError,
  OverflowError,
  CircleCancelledError,
  describeError,
} from "@sharibo/client";
import { FriendbotRetryableError, FRIEND_BOT_RATE_LIMIT_MESSAGE } from "./friendbot.js";

/**
 * Decode an error into a message fit for the UI.
 *
 * Order matters: the typed contract-error subclasses are checked before their
 * `ContractError` base, and `RpcError` before the generic `Error` fallback,
 * because the base classes would otherwise swallow the specific copy.
 *
 * `t` is only consulted for the genuinely-unknown case, which keeps this
 * module free of a hard i18n dependency at call sites that have no
 * translator.
 *
 * Extracted from App.tsx (see #508).
 *
 * Note: `state/circleMachine.ts` also exports a `toUiError`, for the retry
 * classifier in `diagnose()`. That one is deliberately *not* i18n-aware and
 * takes no translator; the two are separate concerns and are left to be
 * reconciled once the error model settles.
 */
export function toUiError(
  error: unknown,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (error instanceof FriendbotRetryableError) {
    return FRIEND_BOT_RATE_LIMIT_MESSAGE;
  }

  // Typed contract-error subclasses — no XDR string matching needed.
  if (error instanceof AlreadyClaimedError) {
    return "This proof has already been claimed in this circle. Try the next round.";
  }
  if (error instanceof InvalidProofError) {
    return "The zero-knowledge proof is invalid. Please regenerate and try again.";
  }
  if (error instanceof RoundNotFundedError) {
    return "The circle is not fully funded yet. All members must contribute first.";
  }
  if (error instanceof WrongRoundTagError) {
    return "Proof is bound to a different round. Regenerate the proof for the current round.";
  }
  if (error instanceof CircleNotFoundError) {
    return "Circle not found on-chain. It may have been cancelled or never created.";
  }
  if (error instanceof RoundFullError) {
    return "This round is already fully funded. No more contributions are accepted.";
  }
  if (error instanceof OverflowError) {
    return "Contribution amount or circle size caused an arithmetic overflow.";
  }
  if (error instanceof CircleCancelledError) {
    return "This circle has been cancelled. Start a new one.";
  }

  if (error instanceof ContractError) {
    return error.message;
  }
  if (error instanceof RpcError) {
    return "Network error — please check your connection and retry.";
  }
  if (error instanceof ProvingError) {
    return "Proof generation failed. Please try again.";
  }
  if (error instanceof InvalidInputError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return t("error.generic");
}

/**
 * Same shape as {@link toUiError}, but additionally recognizes Sharibo
 * contract rejections — the raw `Error(Contract, #4)` Soroban surfaces get
 * rendered as "AlreadyClaimed: this proof's nullifier was already used; ..."
 * via `describeError()` (packages/client/src/errors.ts) instead of the bare
 * error code. Falls back to the same Friendbot special-case and raw-message
 * behavior as `toUiError` for anything that isn't a recognized contract error.
 *
 * Extracted from App.tsx (see #508).
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof FriendbotRetryableError) {
    return FRIEND_BOT_RATE_LIMIT_MESSAGE;
  }
  return describeError(error);
}
