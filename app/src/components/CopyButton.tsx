import { useEffect, useState } from "react";
import { useI18n } from "../i18n.js";
import styles from "./CopyButton.module.css";

/** How long the ✓ confirmation stays up before reverting to 📋. */
const CONFIRM_MS = 1500;

/**
 * Copy-to-clipboard for a truncated value (an address or a tx hash), which
 * otherwise exists nowhere else on screen.
 *
 * Falls back to `window.prompt` when the async Clipboard API is unavailable —
 * non-secure contexts and older browsers — because a prompt is at least
 * trivially copyable by hand, which is the whole point of the control.
 *
 * Extracted from App.tsx (see #508).
 */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const tmr = setTimeout(() => setCopied(false), CONFIRM_MS);
    return () => clearTimeout(tmr);
  }, [copied]);

  async function handleCopy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      window.prompt(`Clipboard unavailable — copy ${label} manually:`, value);
    }
  }

  return (
    <button
      type="button"
      className={styles.copyBtn}
      onClick={handleCopy}
      aria-label={t("copy.aria", { label })}
      title={t("copy.title", { label })}
    >
      {copied ? "✓" : "📋"}
    </button>
  );
}
