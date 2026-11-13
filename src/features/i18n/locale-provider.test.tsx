/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageSwitcher } from "./language-switcher";
import { LocaleProvider } from "./locale-provider";
import {
  initializeLocale,
  LOCALE_STORAGE_KEY,
  useLocaleStore,
} from "./locale-store";
import { useI18n } from "./use-i18n";

vi.mock("next/navigation", () => ({ usePathname: () => "/settings" }));
function Page() {
  const { t } = useI18n();
  return (
    <>
      <LanguageSwitcher />
      <h1>{t("Home")}</h1>
      <p>My project 中文</p>
    </>
  );
}
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  useLocaleStore.setState({ locale: "en" });
  document.documentElement.lang = "en";
  vi.restoreAllMocks();
});

describe("Given a multilingual console", () => {
  it("detects a Chinese browser and persists an explicit English choice across remounts", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["zh-TW", "en"]);
    const first = render(
      <LocaleProvider>
        <Page />
      </LocaleProvider>,
    );
    expect(screen.getByRole("heading", { name: "首页" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("zh-CN");
    fireEvent.change(
      screen.getByRole("combobox", { name: "Language / 语言" }),
      { target: { value: "en" } },
    );
    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    first.unmount();
    render(
      <LocaleProvider>
        <Page />
      </LocaleProvider>,
    );
    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByText("My project 中文")).toBeInTheDocument();
  });
  it("updates a mounted page immediately and syncs a choice from another tab", () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    render(
      <LocaleProvider>
        <Page />
      </LocaleProvider>,
    );
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "zh-CN" },
    });
    expect(screen.getByRole("heading", { name: "首页" })).toBeInTheDocument();
    act(() =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: LOCALE_STORAGE_KEY,
          newValue: "en",
        }),
      ),
    );
    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    act(() =>
      window.dispatchEvent(
        new StorageEvent("storage", { key: "unrelated", newValue: "zh-CN" }),
      ),
    );
    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
  });
  it("keeps language switching usable when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-US"]);
    expect(() => initializeLocale()).not.toThrow();
    render(<Page />);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "zh-CN" },
    });
    expect(screen.getByRole("heading", { name: "首页" })).toBeInTheDocument();
  });
  it("renders the initial English snapshot without browser storage on the server", () => {
    const read = vi.spyOn(Storage.prototype, "getItem");
    useLocaleStore.setState({ locale: "zh-CN" });
    expect(renderToString(<Page />)).toContain("Home");
    expect(read).not.toHaveBeenCalled();
  });
  it("restores navigator.language when a cleared preference arrives and navigator.languages is empty", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue([]);
    vi.spyOn(navigator, "language", "get").mockReturnValue("zh-CN");
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    render(
      <LocaleProvider>
        <Page />
      </LocaleProvider>,
    );
    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();

    act(() =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: LOCALE_STORAGE_KEY,
          newValue: null,
        }),
      ),
    );

    expect(screen.getByRole("heading", { name: "首页" })).toBeInTheDocument();
  });
  it("ignores session storage events that do not change the saved language preference", () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    render(
      <LocaleProvider>
        <Page />
      </LocaleProvider>,
    );

    act(() =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: LOCALE_STORAGE_KEY,
          newValue: "zh-CN",
          storageArea: window.sessionStorage,
        }),
      ),
    );

    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
  });
});
