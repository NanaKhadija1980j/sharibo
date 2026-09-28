import type { ClaimStage } from "../types.js";
import styles from "./ClaimProgress.module.css";

/**
 * The visible stages of a claim, in the order they actually occur.
 *
 * snarkjs's fullProve is one opaque call, so "proving" covers witness
 * computation + proof generation together — it gets its own elapsed timer
 * instead of a substage breakdown, since we can't observe a finer boundary
 * inside it.
 */
export const CLAIM_STAGES: ClaimStage[] = [
  "artifacts",
  "proving",
  "verifying",
  "funding",
  "submitting",
];

/**
 * Stage captions.
 *
 * These are NOT translated. The pre-extraction code also built a localized
 * `Record<ClaimStage, string>` from `t("claim.stage.*")` and then rendered
 * the untranslated map below instead — a latent i18n bug. Deleting the dead
 * localized map keeps the rendered output byte-identical; actually switching
 * to the translations is a visible copy change and belongs in its own PR.
 */
export const CLAIM_STAGE_LABELS: Record<ClaimStage, string> = {
  artifacts: "Fetching proving artifacts (wasm + zkey)…",
  proving: "Proving…",
  verifying: "Verifying proof locally…",
  funding: "Funding a fresh, unlinked recipient…",
  submitting: "Submitting the claim…",
};

/**
 * So a claim never reads as a hung tab: each real substage of the claim gets
 * its own line here (fullProve itself stays one opaque "proving" step, per
 * snarkjs, but that step gets a live elapsed-seconds counter + spinner so a
 * slow prove still visibly ticks rather than sitting static).
 *
 * Extracted from App.tsx (see #508).
 */
export function ClaimProgress({
  stage,
  elapsedSeconds,
}: {
  stage: ClaimStage;
  elapsedSeconds: number;
}) {
  const activeIndex = CLAIM_STAGES.indexOf(stage);

  return (
    <div className={styles.claimProgress}>
      <div className={styles.stepper}>
        {CLAIM_STAGES.map((s, i) => (
          <div
            key={s}
            className={`${styles.step} ${i < activeIndex ? styles.done : i === activeIndex ? styles.active : ""}`}
          >
            <span className={styles.stepDot}>{i < activeIndex ? "✓" : i + 1}</span>
            {CLAIM_STAGE_LABELS[s]}
          </div>
        ))}
      </div>
      {stage === "proving" && (
        <p className={styles.techline}>
          <span className={styles.spinner} aria-hidden="true" /> Groth16 · BLS12-381 · 3,757 constraints ·
          proving locally in your browser, nothing sent anywhere until the proof is done ·{" "}
          {elapsedSeconds}s elapsed
        </p>
      )}
    </div>
  );
}
