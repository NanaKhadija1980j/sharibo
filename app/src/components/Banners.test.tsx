import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@sharibo/client", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, networkOf: vi.fn() };
});

vi.mock("../config", () => ({
  config: {
    contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
    testTokenContractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  },
  configError: [],
}));

import { networkOf } from "@sharibo/client";
import { I18nProvider } from "../i18n";

/**
 * Both banners decide once, at module load, whether they are on a testnet —
 * so each case has to re-import the module with `networkOf` primed. The
 * importers are spelled out so the bundler can resolve them statically.
 */
/**
 * Both banners decide once, at module load, whether they are on a testnet —
 * so each case has to re-import the module with `networkOf` primed. The two
 * loaders are written out separately (rather than over a keyed map) so the
 * bundler can resolve the dynamic imports statically and TypeScript keeps a
 * concrete module type for each.
 */
async function loadTestnetBanner(net: "testnet" | "mainnet") {
  vi.resetModules();
  vi.mocked(networkOf).mockReturnValue(net);
  return (await import("./TestnetBanner.js")).TestnetBanner;
}

async function loadNetworkBanner(net: "testnet" | "mainnet") {
  vi.resetModules();
  vi.mocked(networkOf).mockReturnValue(net);
  return (await import("./NetworkBanner.js")).NetworkBanner;
}

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

describe("TestnetBanner", () => {
  it("renders the testnet warning and links to the limitations", async () => {
    const TestnetBanner = await loadTestnetBanner("testnet");
    renderWithI18n(<TestnetBanner />);

    expect(screen.getByText(/stellar testnet — no real funds/i)).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", expect.stringContaining("#honest-limitations"));
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("renders nothing at all on mainnet", async () => {
    const TestnetBanner = await loadTestnetBanner("mainnet");
    const { container } = renderWithI18n(<TestnetBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("NetworkBanner", () => {
  it("warns on testnet", async () => {
    const NetworkBanner = await loadNetworkBanner("testnet");
    renderWithI18n(<NetworkBanner />);

    expect(screen.getByText(/stellar testnet — no real funds/i)).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      expect.stringContaining("#honest-limitations"),
    );
  });

  it("renders nothing on mainnet", async () => {
    const NetworkBanner = await loadNetworkBanner("mainnet");
    const { container } = renderWithI18n(<NetworkBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
