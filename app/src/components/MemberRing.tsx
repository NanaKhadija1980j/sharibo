import { useI18n } from "../i18n.js";
import styles from "./MemberRing.module.css";

export interface RingMember {
  funded: boolean;
  /** Optimistic flag while a contribution transaction is in flight. */
  pending?: boolean;
}

/**
 * The ring of members, with the paid-out recipient shown as an unlabelled "?"
 * once the claim lands.
 *
 * Purely presentational, and deliberately so: after a claim, none of the five
 * nodes is highlighted as "the one that claimed" — that is the point. From
 * outside the ring, all five remain equally plausible; only the demo operator
 * (via the radio picker) ever knows which one actually did.
 *
 * This replaces an earlier SVG-with-viewBox implementation and the div
 * implementation that was inlined in App.tsx. See #508.
 *
 * Node positions are computed from a CSS custom property rather than a
 * `useRingRadius()` hook reading `getComputedStyle`: `calc()` resolves per
 * frame, so the ring stays correct across responsive breakpoints with no
 * resize listener, no initial-layout flash, and no duplicated fallback value
 * in JS. The `100px` fallback only applies if `--ring-radius` is missing
 * entirely.
 */
export function MemberRing({
  members,
  revealed,
}: {
  members: RingMember[];
  revealed: boolean;
}) {
  const { t } = useI18n();
  const fundedCount = members.filter((m) => m.funded).length;

  const ringLabel = revealed
    ? t("ring.label.revealed", { count: members.length })
    : t("ring.label.loading", { count: members.length, funded: fundedCount });

  const captionId = "ring-caption";

  return (
    <div className={styles.ringWrap}>
      <div
        className={styles.ring}
        role="img"
        aria-label={ringLabel}
        {...(revealed ? { "aria-describedby": captionId } : {})}
      >
        <div className={styles.ringCenter} aria-hidden="true">
          {revealed ? "✓" : "pot"}
        </div>
        {members.map((m, i) => {
          const angle = (i / members.length) * 2 * Math.PI - Math.PI / 2;
          const cos = Math.cos(angle).toFixed(6);
          const sin = Math.sin(angle).toFixed(6);
          return (
            <div
              key={i}
              aria-hidden="true"
              className={`${styles.ringNode} ${m.funded ? styles.funded : ""} ${m.pending ? styles.pending : ""}`}
              style={{
                transform: `translate(calc(var(--ring-radius, 100px) * ${cos}), calc(var(--ring-radius, 100px) * ${sin}))`,
              }}
            >
              {i + 1}
            </div>
          );
        })}
        {revealed && (
          <div
            aria-hidden="true"
            className={`${styles.ringNode} ${styles.ringRecipient}`}
            style={{ transform: "translate(0px, var(--ring-recipient-offset, -170px))" }}
          >
            ?
          </div>
        )}
      </div>
      {revealed && (
        <p id={captionId} role="note" className={styles.ringCaption}>
          Payout landed on the address above — cryptographically, it could be tied to <em>any</em>{" "}
          of the {members.length} members in the ring. An outside observer cannot tell which.
        </p>
      )}
    </div>
  );
}

export function MemberRingSkeleton() {
  const radius = 100;
  return (
    <div className="ring-wrap" aria-hidden="true">
      <div className="ring">
        <div className="skeleton skeleton-ring-center" />
        {Array.from({ length: 5 }, (_, i) => {
          const angle = (i / 5) * 2 * Math.PI - Math.PI / 2;
          const x = Math.round(Math.cos(angle) * radius);
          const y = Math.round(Math.sin(angle) * radius);
          return (
            <div
              key={i}
              className="skeleton skeleton-ring-node"
              style={{ transform: `translate(${x}px, ${y}px)` }}
            />
          );
        })}
      </div>
    </div>
  );
}
