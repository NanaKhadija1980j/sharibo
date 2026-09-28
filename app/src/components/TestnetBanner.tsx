import { useI18n } from "../i18n.js";
import { networkOf } from "@sharibo/client";
import { config } from "../config.js";
import styles from "./TestnetBanner.module.css";

const README_URL = "https://github.com/crackedstudio/sharibo#honest-limitations";

// `config` is null when validation failed (config.ts gates on that before
// rendering anything), so fall back to "" rather than crashing this module at
// import time on a misconfigured build.
const NETWORK_PASSPHRASE = config?.networkPassphrase ?? "";

const isTestnet = networkOf(NETWORK_PASSPHRASE) === "testnet";
const BANNER_TEXT = isTestnet ? "Stellar testnet — no real funds" : "";

/**
 * Persistent "you're on testnet" notice, shown only on a testnet build.
 *
 * Renders nothing at all on mainnet — the whole point is that it should be
 * impossible to mistake a testnet run for a real one.
 *
 * Extracted from App.tsx (see #508).
 */
export function TestnetBanner() {
  const { t } = useI18n();
  if (!isTestnet) return null;
  return (
    <div className={styles.banner}>
      <span>{BANNER_TEXT}</span>
      <a className={styles.bannerLink} href={README_URL} target="_blank" rel="noreferrer">
        honest limitations ↗
      </a>
    </div>
  );
}
