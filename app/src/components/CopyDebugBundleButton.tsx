import { useEffect, useState } from "react";
import { copyDebugBundle, type BundleInput } from "../lib/debugBundle.js";
import { config } from "../config.js";

// Injected at build time by Vite; falls back to "dev" in local dev.
const APP_VERSION: string =
  (typeof import.meta.env.VITE_APP_VERSION === "string"
    ? import.meta.env.VITE_APP_VERSION
    : undefined) ?? "dev";

const BUG_REPORT_URL =
  "https://github.com/crackedstudio/sharibo/issues/new?template=bug_report.yml";

/** How long the "Copied!" state stays up before reverting. */
const CONFIRM_MS = 2500;

type Status = "idle" | "copied" | "fallback" | "error";

/**
 * Collects the current circle-flow state into a DebugBundle and copies it as
 * formatted markdown to the clipboard. Placed in the footer of the circle
 * screen and next to any error message so a user can grab it whenever
 * something goes wrong.
 *
 * Secret keys are never included — see app/src/lib/debugBundle.ts for the
 * allow-list and the defence-in-depth regex backstop.
 *
 * Extracted from App.tsx (see #508).
 */
export function CopyDebugBundleButton({
  circleId,
  round,
  currentStep,
  lastError,
  fundedCount,
  circleSize,
  pot,
  timings,
}: {
  circleId: bigint | null;
  round: number;
  currentStep: string | null;
  lastError: string | null;
  fundedCount: number;
  circleSize: number;
  pot: bigint;
  timings: Record<string, number>;
}) {
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    if (status === "idle") return;
    const t = setTimeout(() => setStatus("idle"), CONFIRM_MS);
    return () => clearTimeout(t);
  }, [status]);

  async function handleClick() {
    const input: BundleInput = {
      appVersion: APP_VERSION,
      network: {
        // config is non-null here: the app gates on configError and renders the
        // setup screen otherwise, so this button is never reached without it.
        contractId: config.contractId,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.networkPassphrase,
        tokenContractId: config.testTokenContractId,
      },
      circleId,
      round,
      currentStep,
      lastError,
      fundedCount,
      circleSize,
      pot,
      // Artifact hashes are not tracked in the App's state yet; omit rather
      // than leave undefined — the bundle accepts an empty record.
      artifactHashes: {},
      timings,
      userAgent: navigator.userAgent,
    };

    const result = await copyDebugBundle(input);
    if (result.ok) {
      setStatus("copied");
    } else if (result.markdown) {
      // Clipboard API blocked but we have the markdown — show it via prompt().
      window.prompt(
        "Clipboard unavailable. Select all and copy manually, then paste into your bug report:",
        result.markdown,
      );
      setStatus("fallback");
    } else {
      setStatus("error");
    }
  }

  const label =
    status === "copied"
      ? "✓ Copied!"
      : status === "fallback"
        ? "Opened prompt"
        : status === "error"
          ? "Error — retry?"
          : "📋 Copy debug bundle";

  return (
    <span className="debug-bundle-wrap">
      <button
        type="button"
        className="btn btn-ghost btn-small"
        onClick={handleClick}
        title="Copy a redacted debug snapshot to your clipboard, ready to paste into a bug report. No secret keys are included."
      >
        {label}
      </button>
      {(status === "copied" || status === "fallback") && (
        <a
          className="link fineprint"
          href={BUG_REPORT_URL}
          target="_blank"
          rel="noreferrer"
        >
          open bug report ↗
        </a>
      )}
    </span>
  );
}
