import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "../i18n";
import { Stepper } from "./Stepper";

function renderStepper(step: 0 | 1 | 2 | 3) {
  return render(
    <I18nProvider>
      <Stepper step={step} />
    </I18nProvider>,
  );
}

const listItems = (c: HTMLElement) => Array.from(c.querySelectorAll("li"));

describe("Stepper", () => {
  it("renders the four circle-flow steps as a labelled list", () => {
    const { container } = renderStepper(0);
    const list = container.querySelector("ol")!;

    expect(listItems(container)).toHaveLength(4);
    // nav + ol give "step N of 4" list semantics without changing the visuals.
    expect(screen.getByRole("navigation", { name: /circle progress/i })).toBeInTheDocument();
  });

  it("marks exactly the active step with aria-current", () => {
    const { container } = renderStepper(1);
    const items = listItems(container);

    expect(items[0].getAttribute("aria-current")).toBeNull();
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(items[2].getAttribute("aria-current")).toBeNull();
    expect(items[3].getAttribute("aria-current")).toBeNull();
  });

  it("applies the done/active state classes", () => {
    const { container } = renderStepper(2);
    const items = listItems(container);

    expect(items[0].className).toMatch(/done/);
    expect(items[1].className).toMatch(/done/);
    expect(items[2].className).toMatch(/active/);
    expect(items[3].className).not.toMatch(/done|active/);
  });

  it("hides the decorative dot from assistive tech", () => {
    const { container } = renderStepper(2);
    for (const dot of Array.from(container.querySelectorAll("span"))) {
      expect(dot).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("puts a ✓ on completed steps and a 1-based number on the rest", () => {
    const { container } = renderStepper(2);
    const dots = Array.from(container.querySelectorAll("span")).map((s) => s.textContent);
    expect(dots).toEqual(["✓", "✓", "3", "4"]);
  });
});
