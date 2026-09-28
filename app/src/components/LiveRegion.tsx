/**
 * Persistent ARIA live region.
 *
 * The element must stay mounted for the lifetime of the app: assistive tech
 * only announces a change to a live region it has already observed, so
 * mounting and unmounting one per announcement is the classic way to end up
 * with a region that is announced exactly never. The paired
 * `usePoliteLiveRegion` hook (app/src/usePoliteLiveRegion.tsx) handles the
 * debouncing and hands over the message.
 *
 * Visually hidden but not `display:none` — a hidden element is not exposed to
 * the accessibility tree at all, which would defeat the point.
 *
 * Extracted from App.tsx (see #508).
 */
export function LiveRegion({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}
    >
      {message}
    </div>
  );
}
