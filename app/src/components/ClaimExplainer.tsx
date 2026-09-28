import { useI18n } from "../i18n.js";
import styles from "./ClaimExplainer.module.css";

/**
 * Collapsible explainer for what the claim proof actually guarantees.
 *
 * Extracted from App.tsx (see #508).
 */
export function ClaimExplainer() {
  const { t } = useI18n();
  return (
    <details className={styles.explainer}>
      <summary>How this claim proof works</summary>
      <div className={styles.body}>
        <section>
          <h3>{t("explainer.sayingTitle")}</h3>
          <p>{t("explainer.sayingBody")}</p>
        </section>
        <section>
          <h3>{t("explainer.secretTitle")}</h3>
          <p>{t("explainer.secretBody")}</p>
        </section>
        <section>
          <h3>{t("explainer.checksTitle")}</h3>
          <ol>
            <li>{t("explainer.check1")}</li>
            <li>{t("explainer.check2")}</li>
            <li>{t("explainer.check3")}</li>
            <li>{t("explainer.check4")}</li>
          </ol>
        </section>
        <section>
          <h3>{t("explainer.observersTitle")}</h3>
          <p>{t("explainer.observersBody")}</p>
        </section>
      </div>
    </details>
  );
}
