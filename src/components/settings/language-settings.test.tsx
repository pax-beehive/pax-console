/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LOCALE_STORAGE_KEY,
  useLocaleStore,
} from "@/features/i18n/locale-store";
import { LanguageSettings } from "./language-settings";

const account = vi.hoisted(() => ({ region: undefined as string | undefined }));
vi.mock("@/features/region/account-region", () => ({
  accountRegionName: () => account.region,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/language",
}));

afterEach(() => {
  cleanup();
  account.region = undefined;
  useLocaleStore.setState({ locale: "en" });
  window.localStorage.clear();
});

describe("Given the language and region settings", () => {
  it("switches the interface language and remembers it in this browser", async () => {
    const user = userEvent.setup();
    render(<LanguageSettings />);
    expect(screen.getByRole("radio", { name: "English" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.click(screen.getByRole("radio", { name: "简体中文" }));
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("zh-CN");
    expect(screen.getByRole("radio", { name: "简体中文" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(
      screen.getAllByRole("heading", { name: "语言与区域" }).length,
    ).toBeGreaterThan(0);
  });

  it("names the account region only when the account has one", () => {
    const { rerender } = render(<LanguageSettings />);
    expect(
      screen.queryByRole("heading", { name: "Account region" }),
    ).not.toBeInTheDocument();

    account.region = "United States";
    rerender(<LanguageSettings />);
    expect(
      screen.getByRole("heading", { name: "Account region" }),
    ).toBeInTheDocument();
    expect(screen.getByText("United States")).toBeVisible();
  });
});
