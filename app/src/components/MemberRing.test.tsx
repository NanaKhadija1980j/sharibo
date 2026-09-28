import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "../i18n";
import { MemberRing } from "./MemberRing";

const members = [
  { funded: true },
  { funded: true },
  { funded: false },
  { funded: false },
  { funded: false },
];

function renderRing(props: Partial<React.ComponentProps<typeof MemberRing>> = {}) {
  return render(
    <I18nProvider>
      <MemberRing members={members} revealed={false} {...props} />
    </I18nProvider>,
  );
}

const nodes = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>("div[class*='ringNode']"));

describe("MemberRing", () => {
  it("renders one node per member, numbered 1..n", () => {
    const { container } = renderRing();
    const all = nodes(container);

    expect(all).toHaveLength(5);
    expect(all.map((n) => n.textContent)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("positions nodes from the CSS radius token, not a JS-measured value", () => {
    // calc() keeps the ring correct across breakpoints with no resize
    // listener and no initial-layout flash.
    const { container } = renderRing();
    for (const node of nodes(container)) {
      expect(node.style.transform).toContain("var(--ring-radius");
      expect(node.style.transform).toContain("calc(");
    }
  });

  it("spreads nodes evenly around the circle, starting at 12 o'clock", () => {
    const { container } = renderRing();

    // angle = (i / n) * 2PI - PI/2, so node 0 sits at 12 o'clock and the rest
    // are spread evenly.
    //
    // jsdom does not resolve calc(), so read the coefficients straight back
    // out of the transform: each is the number following "*" in
    // "calc(var(--ring-radius, 100px) * <coeff>)".
    const coefs = nodes(container).map((n) =>
      Array.from(n.style.transform.matchAll(/\*\s*(-?[\d.]+)\s*\)/g)).map((m) => Number(m[1])),
    );
    for (const c of coefs) expect(c).toHaveLength(2);

    const expected = (i: number): [number, number] => {
      const angle = (i / 5) * 2 * Math.PI - Math.PI / 2;
      return [Number(Math.cos(angle).toFixed(6)), Number(Math.sin(angle).toFixed(6))];
    };

    for (let i = 0; i < 5; i++) {
      const [ex, ey] = expected(i);
      expect(coefs[i][0]).toBeCloseTo(ex, 5);
      expect(coefs[i][1]).toBeCloseTo(ey, 5);
    }

    // Node 0 is straight up: x ~ 0, y ~ -radius.
    expect(coefs[0][0]).toBeCloseTo(0, 5);
    expect(coefs[0][1]).toBeCloseTo(-1, 5);
    // With an odd number of members no node lands exactly at the bottom; the
    // closest sits at (2/5)*2PI - PI/2, i.e. sin ~= 0.809.
    expect(coefs[2][1]).toBeCloseTo(0.809017, 5);
    // Every node is on the unit circle, so no two overlap.
    for (const [cx, cy] of coefs) {
      expect(Math.hypot(cx, cy)).toBeCloseTo(1, 5);
    }
  });

  it("marks funded members and leaves pending ones flagged", () => {
    const { container } = renderRing({
      members: [{ funded: true }, { funded: false, pending: true }, ...members.slice(2)],
    });
    const all = nodes(container);

    expect(all[0].className).toMatch(/funded/);
    expect(all[1].className).toMatch(/pending/);
    expect(all[1].className).not.toMatch(/\bfunded\b/);
  });

  it("hides each node from assistive tech and labels the ring as an image", () => {
    const { container } = renderRing();
    expect(screen.getByRole("img")).toBeInTheDocument();
    for (const node of nodes(container)) {
      expect(node).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("shows the pot placeholder and no caption before a claim", () => {
    const { container } = renderRing();
    expect(container.textContent).toContain("pot");
    expect(container.querySelector("[role='note']")).toBeNull();
  });

  it("adds the unlabelled recipient marker and a caption once revealed", () => {
    const { container } = renderRing({ revealed: true });

    expect(container.textContent).toContain("✓");
    const caption = container.querySelector("[role='note']")!;
    expect(caption).toBeInTheDocument();
    expect(caption).toHaveTextContent(/could be tied to/i);
    // The recipient is the extra "?" node on top of the five members.
    expect(container.textContent).toContain("?");
  });

  it("does not highlight any member as the one that claimed", () => {
    // The whole point: from outside the ring all five stay equally plausible.
    const { container } = renderRing({ revealed: true });
    for (const node of nodes(container)) {
      if (node.textContent === "?") continue;
      expect(node.className).not.toMatch(/recipient|claimed|winner/);
    }
  });

  it("only describes the ring with the caption once revealed", () => {
    const hidden = renderRing();
    expect(screen.getByRole("img")).not.toHaveAttribute("aria-describedby");

    const revealed = renderRing({ revealed: true });
    const captionId = revealed.container.querySelector("[role='note']")!.id;
    expect(screen.getAllByRole("img")[1]).toHaveAttribute("aria-describedby", captionId);
  });
});
