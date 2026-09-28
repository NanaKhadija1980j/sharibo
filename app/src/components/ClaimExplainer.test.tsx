import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "../i18n";
import { ClaimExplainer } from "./ClaimExplainer";

function renderExplainer() {
  return render(
    <I18nProvider>
      <ClaimExplainer />
    </I18nProvider>,
  );
}

describe("ClaimExplainer", () => {
  it("is collapsed by default behind a summary", () => {
    const { container } = renderExplainer();
    const details = container.querySelector("details")!;

    expect(details).toBeInTheDocument();
    expect(details.open).toBe(false);
    expect(screen.getByText(/how this claim proof works/i)).toBeInTheDocument();
  });

  it("renders all four sections", () => {
    const { container } = renderExplainer();
    expect(container.querySelectorAll("section")).toHaveLength(4);
    expect(container.querySelectorAll("h3")).toHaveLength(4);
  });

  it("lists the four verification checks", () => {
    const { container } = renderExplainer();
    expect(container.querySelectorAll("ol li")).toHaveLength(4);
  });

  it("has non-empty copy in every section", () => {
    const { container } = renderExplainer();
    for (const section of Array.from(container.querySelectorAll("section"))) {
      expect((section.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
  });
});
