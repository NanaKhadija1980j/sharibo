import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ClaimProgress, CLAIM_STAGES, CLAIM_STAGE_LABELS } from "./ClaimProgress";

// ClaimProgress is the highest-value extraction of #508: pure presentation
// over (stage, elapsedSeconds), and completely untested while it lived inline
// in App.tsx.

type Stage = (typeof CLAIM_STAGES)[number];

function steps(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("div[class*='step_']"));
}

function dots(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll<HTMLElement>("span[class*='stepDot']")).map(
    (d) => d.textContent,
  );
}

describe("ClaimProgress", () => {
  it("renders every stage, in order, whatever the current stage", () => {
    const { container } = render(<ClaimProgress stage="funding" elapsedSeconds={0} />);

    expect(steps(container)).toHaveLength(CLAIM_STAGES.length);
    for (const stage of CLAIM_STAGES) {
      expect(container.textContent).toContain(CLAIM_STAGE_LABELS[stage]);
    }
  });

  it("marks stages before the current one done and the current one active", () => {
    // "funding" is index 3, so artifacts/proving/verifying are done.
    const { container } = render(<ClaimProgress stage="funding" elapsedSeconds={0} />);
    const s = steps(container);

    expect(s[0].className).toMatch(/done/);
    expect(s[1].className).toMatch(/done/);
    expect(s[2].className).toMatch(/done/);
    expect(s[3].className).toMatch(/active/);
    expect(s[4].className).not.toMatch(/done|active/);
  });

  it("marks only the first stage active when starting out", () => {
    const { container } = render(<ClaimProgress stage="artifacts" elapsedSeconds={0} />);
    const s = steps(container);

    expect(s[0].className).toMatch(/active/);
    expect(s.slice(1).every((el) => !/done|active/.test(el.className))).toBe(true);
  });

  it("marks only the last stage active when finishing", () => {
    const { container } = render(<ClaimProgress stage="submitting" elapsedSeconds={0} />);
    const s = steps(container);

    expect(s[4].className).toMatch(/active/);
    expect(s.slice(0, 4).every((el) => /done/.test(el.className))).toBe(true);
  });

  it("puts a ✓ on completed stages and a 1-based number on the rest", () => {
    const { container } = render(<ClaimProgress stage="verifying" elapsedSeconds={0} />);
    expect(dots(container)).toEqual(["✓", "✓", "3", "4", "5"]);
  });

  it("shows the live elapsed timer only while proving", () => {
    const proving = render(<ClaimProgress stage="proving" elapsedSeconds={7} />);
    expect(proving.container.textContent).toContain("7s elapsed");
    expect(proving.container.textContent).toContain("BLS12-381");

    const funding = render(<ClaimProgress stage="funding" elapsedSeconds={7} />);
    expect(funding.container.textContent).not.toContain("s elapsed");
  });

  it("ticks the elapsed counter as the parent re-renders", () => {
    const { container, rerender } = render(<ClaimProgress stage="proving" elapsedSeconds={1} />);
    expect(container.textContent).toContain("1s elapsed");

    rerender(<ClaimProgress stage="proving" elapsedSeconds={42} />);
    expect(container.textContent).toContain("42s elapsed");
  });

  it("hides the spinner from assistive tech", () => {
    const { container } = render(<ClaimProgress stage="proving" elapsedSeconds={1} />);
    const spinner = container.querySelector("span[class*='spinner']");

    expect(spinner).not.toBeNull();
    expect(spinner!.getAttribute("aria-hidden")).toBe("true");
  });

  it("has a caption for every stage it can be given", () => {
    for (const stage of CLAIM_STAGES) {
      expect(CLAIM_STAGE_LABELS[stage as Stage]).toBeTruthy();
    }
    expect(Object.keys(CLAIM_STAGE_LABELS)).toHaveLength(CLAIM_STAGES.length);
  });
});
