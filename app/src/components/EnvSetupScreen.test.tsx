import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "../i18n";
import { EnvSetupScreen } from "./EnvSetupScreen";

function renderScreen(errors: string[]) {
  return render(
    <I18nProvider>
      <EnvSetupScreen errors={errors} />
    </I18nProvider>,
  );
}

describe("EnvSetupScreen", () => {
  it("blocks the app with a setup-required heading", () => {
    renderScreen(["VITE_SHARIBO_CONTRACT_ID - is missing or empty"]);
    expect(screen.getByRole("heading", { name: /setup required/i })).toBeInTheDocument();
  });

  it("renders every config error verbatim, one per list item", () => {
    // This is the whole value of the screen: a misconfigured build should name
    // the exact variables that are wrong, not just say "setup required".
    const errors = [
      "VITE_SHARIBO_CONTRACT_ID - is missing or empty",
      'VITE_STELLAR_RPC_URL - "nope" is not a valid HTTP(S) URL',
      "VITE_STELLAR_NETWORK_PASSPHRASE - is missing or empty",
    ];
    const { container } = renderScreen(errors);

    const items = Array.from(container.querySelectorAll("li"));
    expect(items).toHaveLength(errors.length);
    for (const [i, err] of errors.entries()) {
      expect(items[i].querySelector("code")!.textContent).toBe(err);
    }
  });

  it("shows an empty list without crashing when validation produced nothing", () => {
    const { container } = renderScreen([]);
    expect(container.querySelectorAll("li")).toHaveLength(0);
    expect(screen.getByRole("heading", { name: /sharibo/i })).toBeInTheDocument();
  });

  it("offers a language switcher so the guidance is readable", () => {
    renderScreen([]);
    expect(screen.getByRole("combobox", { name: /language/i })).toBeInTheDocument();
  });
});
