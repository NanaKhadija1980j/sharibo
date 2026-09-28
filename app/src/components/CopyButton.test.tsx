import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CopyButton } from "./CopyButton";
import { I18nProvider } from "../i18n";

function renderButton(value: string, label: string) {
  return render(
    <I18nProvider>
      <CopyButton value={value} label={label} />
    </I18nProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CopyButton", () => {
  it("copies the value and confirms for 1.5s", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const { container } = renderButton("GABC123", "address");
    const button = screen.getByRole("button");

    expect(button).toHaveTextContent("📋");
    fireEvent.click(button);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("GABC123"));
    await waitFor(() => expect(button).toHaveTextContent("✓"));

    // The ✓ is a temporary confirmation, not the resting state.
    await waitFor(
      () => expect(container.querySelector("button")).toHaveTextContent("📋"),
      { timeout: 3000 },
    );
  });

  it("falls back to a prompt when the Clipboard API is unavailable", async () => {
    // Non-secure contexts and older browsers have no navigator.clipboard.
    Object.assign(navigator, { clipboard: undefined });
    const prompt = vi.spyOn(window, "prompt").mockReturnValue(null);

    const { container } = renderButton("GXYZ789", "tx hash");
    fireEvent.click(container.querySelector("button")!);

    await waitFor(() => expect(prompt).toHaveBeenCalled());
    // The full value is offered, not the truncated one shown on screen.
    expect(prompt.mock.calls[0][1]).toBe("GXYZ789");
  });

  it("falls back to a prompt when writeText rejects", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    const prompt = vi.spyOn(window, "prompt").mockReturnValue(null);

    const { container } = renderButton("GFAIL", "address");
    fireEvent.click(container.querySelector("button")!);

    await waitFor(() => expect(prompt).toHaveBeenCalled());
    expect(container.querySelector("button")).toHaveTextContent("📋");
  });

  it("is a type=button so it cannot submit a surrounding form", () => {
    const { container } = renderButton("GABC", "address");
    expect(container.querySelector("button")).toHaveAttribute("type", "button");
  });
});
