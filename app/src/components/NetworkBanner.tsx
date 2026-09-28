import { useI18n } from "../i18n.js";
import { networkOf } from "@sharibo/client";
import { config } from "../config.js";
import styles from "./NetworkBanner.module.css";

// See TestnetBanner.tsx for why this is read defensively.
const NETWORK_PASSPHRASE = config?.networkPassphrase ?? "";

const LIMITATIONS_URL = "https://github.com/glorious21-coder/sharibo#honest-limitations";

/**
 * Warns when the configured network is anything other than mainnet.
 *
 * Extracted from App.tsx (see #508).
 */
export function NetworkBanner() {
  const { t } = useI18n();
  const isTestnet = networkOf(NETWORK_PASSPHRASE) !== "mainnet";
  if (!isTestnet) return null;
  return (
    <div className={styles.banner}>
      Stellar testnet — no real funds ·{" "}
      <a href={LIMITATIONS_URL} target="_blank" rel="noreferrer">
        {t("banner.limitationsShort")}
      </a>
    </div>
  );
}
