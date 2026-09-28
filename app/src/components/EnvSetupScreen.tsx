import { useI18n } from "../i18n.js";
import { LanguageSwitcher } from "../i18n.js";
import styles from "./EnvSetupScreen.module.css";

/**
 * Blocking "you have not configured this build" screen.
 *
 * `errors` is the raw list from `configError` (app/src/config.ts) — the same
 * strings the loader would have thrown with — rendered verbatim so a
 * misconfigured build tells the developer exactly which variables are wrong
 * instead of just "setup required".
 *
 * Extracted from App.tsx (see #508).
 */
export function EnvSetupScreen({ errors }: { errors: string[] }) {
  const { t } = useI18n();
  return (
    <div className="page">
      <div className={`card hero`}>
        <LanguageSwitcher className={styles.languageSwitcherHero} />
        <h1>SHARIBO</h1>
        <h2 style={{ color: "var(--color-error, #e55)" }}>{t("env.setupRequired")}</h2>
        <p className={styles.sub}>
          {t("env.setupIntro")} {t("env.setupHowTo")}
        </p>
        <ul style={{ textAlign: "left", margin: "1rem 0", padding: "0 1.25rem" }}>
          {errors.map((err) => (
            <li key={err} style={{ marginBottom: "0.5rem" }}>
              <code>{err}</code>
            </li>
          ))}
        </ul>
        <p className={styles.fineprint}>{t("env.setupDetails")}</p>
      </div>
    </div>
  );
}
