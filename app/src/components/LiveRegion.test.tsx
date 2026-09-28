import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { LiveRegion } from "./LiveRegion";

describe("LiveRegion", () => {
  it("is a polite, atomic live region", () => {
    const { container } = render(<LiveRegion message="Claim submitted" />);
    const region = container.firstElementChild as HTMLElement;

    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveAttribute("aria-atomic", "true");
    expect(region).toHaveTextContent("Claim submitted");
  });

  it("stays mounted as the message changes, so the AT registers it", () => {
    // Mounting a fresh live region per announcement is the classic way to get
    // a region that is announced exactly never.
    const { container, rerender } = render(<LiveRegion message="" />);
    const first = container.firstElementChild;

    rerender(<LiveRegion message="Circle created" />);

    expect(container.firstElementChild).toBe(first);
    expect(first).toHaveTextContent("Circle created");
  });

  it("is visually hidden without being display:none", () => {
    const { container } = render(<LiveRegion message="x" />);
    const region = container.firstElementChild as HTMLElement;

    // display:none would remove it from the accessibility tree entirely,
    // which is the opposite of what a live region is for.
    expect(region.style.display).not.toBe("none");
    // jsdom normalises the clip shorthand, so compare on the shape.
    expect(region.style.clip.replace(/\s/g, "")).toBe("rect(0px,0px,0px,0px)");
    expect(region.style.position).toBe("absolute");
    expect(region.style.width).toBe("1px");
    expect(region.style.overflow).toBe("hidden");
  });
});
