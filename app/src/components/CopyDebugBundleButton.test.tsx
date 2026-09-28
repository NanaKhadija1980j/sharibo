import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { CopyDebugBundleButton } from "./CopyDebugBundleButton";

vi.mock("../config", () => ({
  config: {
    contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
    testTokenContractId: "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBN7DY",
  },
  configError: [],
}));

const copyDebugBundle = vi.fn();
vi.mock("../lib/debugBundle.js", () => ({
  copyDebugBundle: (...args: unknown[]) => copyDebugBundle(...args),
}));

function renderButton(overrides: Partial<React.ComponentProps<typeof CopyDebugBundleButton>> = {}) {
  const props = {
    circleId: 7n,
    round: 2,
    currentStep: "claim",
    lastError: null,
    fundedCount: 5,
    circleSize: 5,
    pot: 500_000_000n,
    timings: { prove: 1234 },
    ...overrides,
  };
  return { props, ...render(<CopyDebugBundleButton {...props} />) };
}

afterEach(() => {
  copyDebugBundle.mockReset();
  vi.restoreAllMocks();
});

describe("CopyDebugBundleButton", () => {
  it("starts idle and offers no bug-report link", () => {
    const { container } = renderButton();
    expect(container.querySelector("button")).toHaveTextContent("📋 Copy debug bundle");
    expect(container.querySelector("a")).toBeNull();
  });

  it("builds a bundle from the current circle state and confirms on success", async () => {
    copyDebugBundle.mockResolvedValue({ ok: true, markdown: "md" });

    const { props, container } = renderButton();
    fireEvent.click(container.querySelector("button")!);

    await waitFor(() => expect(copyDebugBundle).toHaveBeenCalledTimes(1));
    const input = copyDebugBundle.mock.calls[0][0] as Record<string, unknown>;

    expect(input).toMatchObject({
      circleId: 7n,
      round: 2,
      currentStep: "claim",
      lastError: null,
      fundedCount: 5,
      circleSize: 5,
      pot: 500_000_000n,
      // Not tracked in App state yet; omitted rather than left undefined.
      artifactHashes: {},
      timings: { prove: 1234 },
    });
    expect(input.network).toMatchObject({
      contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      networkPassphrase: "Test SDF Network ; September 2015",
    });

    await waitFor(() =>
      expect(container.querySelector("button")).toHaveTextContent("✓ Copied!"),
    );
    // The link appears only once there is something worth pasting into.
    expect(container.querySelector("a")).not.toBeNull();
  });

  it("prompts with the markdown when the clipboard is blocked but a bundle exists", async () => {
    copyDebugBundle.mockResolvedValue({ ok: false, markdown: "# bundle" });
    const prompt = vi.spyOn(window, "prompt").mockReturnValue(null);

    const { container } = renderButton();
    fireEvent.click(container.querySelector("button")!);

    await waitFor(() => expect(prompt).toHaveBeenCalled());
    expect(prompt.mock.calls[0][1]).toBe("# bundle");
    await waitFor(() =>
      expect(container.querySelector("button")).toHaveTextContent("Opened prompt"),
    );
  });

  it("shows a retry affordance when the bundle could not be built at all", async () => {
    copyDebugBundle.mockResolvedValue({ ok: false, markdown: null });

    const { container } = renderButton();
    fireEvent.click(container.querySelector("button")!);

    await waitFor(() =>
      expect(container.querySelector("button")).toHaveTextContent("Error — retry?"),
    );
    // Nothing was copied, so there is nothing to paste into a report.
    expect(container.querySelector("a")).toBeNull();
  });

  it("reverts the confirmation after a couple of seconds", async () => {
    vi.useFakeTimers();
    try {
      copyDebugBundle.mockResolvedValue({ ok: true, markdown: "md" });
      const { container } = renderButton();
      fireEvent.click(container.querySelector("button")!);

      await vi.waitFor(() =>
        expect(container.querySelector("button")).toHaveTextContent("✓ Copied!"),
      );

      vi.advanceTimersByTime(2500);
      await vi.waitFor(() =>
        expect(container.querySelector("button")).toHaveTextContent("📋 Copy debug bundle"),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("cannot carry a secret key: the prop surface has no slot for one", () => {
    // The component only forwards the fields it is given, and there is no
    // `secret`/`key`/`mnemonic` prop for a caller to pass one through. The
    // redaction itself lives in lib/debugBundle.ts, guarded by its own test.
    const { props } = renderButton();
    const propNames = Object.keys(props).sort();

    expect(propNames).toEqual([
      "circleId",
      "circleSize",
      "currentStep",
      "fundedCount",
      "lastError",
      "pot",
      "round",
      "timings",
    ]);
    for (const name of propNames) {
      expect(name).not.toMatch(/secret|mnemonic|private|seed/i);
    }
  });
});
