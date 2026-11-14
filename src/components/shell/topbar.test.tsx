/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  LOCALE_STORAGE_KEY,
  useLocaleStore,
} from "@/features/i18n/locale-store";
import { useConsoleStore } from "@/stores/console-store";
import { Topbar } from "./topbar";

const { signOut, account } = vi.hoisted(() => ({
  signOut: vi.fn(),
  account: { region: undefined as string | undefined },
}));
vi.mock("@/features/api/client", () => ({ signOut }));
vi.mock("@/features/region/account-region", () => ({
  accountRegionName: () => account.region,
}));

function mount(role = "user") {
  render(
    <TooltipProvider>
      <Topbar
        user={{
          user_id: "menu-user",
          email: "alex@example.invalid",
          role,
        }}
      />
    </TooltipProvider>,
  );
}

async function openMenu(role?: string) {
  const user = userEvent.setup();
  mount(role);
  await user.click(screen.getByRole("button", { name: "User menu" }));
  return { user, menu: within(screen.getByRole("menu")) };
}

afterEach(() => {
  cleanup();
  account.region = undefined;
  useLocaleStore.setState({ locale: "en" });
  useConsoleStore.setState({ previewAsUser: false });
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("Given language preferences inside the user menu", () => {
  it("keeps language controls out of the topbar and persists a menu selection", async () => {
    const user = userEvent.setup();
    mount();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText("简体中文")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "User menu" }));
    expect(
      screen.getByRole("menuitemradio", { name: "English" }),
    ).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("menuitemradio", { name: "简体中文" }));
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("zh-CN");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "用户菜单" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "用户菜单" }));
    expect(
      screen.getByRole("menuitemradio", { name: "简体中文" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitem", { name: "退出登录" })).toBeVisible();
    await user.click(screen.getByRole("menuitemradio", { name: "English" }));
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("en");
    expect(screen.getByRole("button", { name: "User menu" })).toBeVisible();
  });

  it("allows keyboard selection and leaves the sign-out action available", async () => {
    const user = userEvent.setup();
    mount();
    screen.getByRole("button", { name: "User menu" }).focus();
    await user.keyboard("{Enter}{ArrowDown}{Enter}");
    expect(useLocaleStore.getState().locale).toBe("zh-CN");
    await user.click(screen.getByRole("button", { name: "用户菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "退出登录" }));
    expect(signOut).toHaveBeenCalledOnce();
  });
});

describe("Given the account menu", () => {
  it("shows who is signed in and which region holds the account", async () => {
    account.region = "Hong Kong";
    const { menu } = await openMenu();
    expect(menu.getByText("alex@example.invalid")).toBeVisible();
    expect(menu.getByText("Account region: Hong Kong")).toBeVisible();
  });

  it("omits the region when accounts are not assigned to one", async () => {
    const { menu } = await openMenu();
    expect(menu.getByText("alex@example.invalid")).toBeVisible();
    expect(menu.queryByText(/Account region/)).not.toBeInTheDocument();
  });

  it("orders the menu from account, to language, to settings and support, to session actions", async () => {
    await openMenu();
    expect(screen.getByRole("menu")).toHaveTextContent(
      /^alex@example\.invalid.*Language.*English.*简体中文.*Settings.*Contact us.*Reload PAX Console.*Sign out$/,
    );
  });

  it("reaches settings and support from the menu", async () => {
    const { menu } = await openMenu();
    expect(menu.getByRole("menuitem", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(menu.getByRole("menuitem", { name: "Contact us" })).toHaveAttribute(
      "href",
      "mailto:kevingeng@paxtech.net",
    );
  });

  it("offers the user preview to administrators only", async () => {
    const { menu } = await openMenu("admin");
    expect(
      menu.getByRole("menuitem", { name: "Preview as user" }),
    ).toBeVisible();
    cleanup();
    const plain = await openMenu();
    expect(
      plain.menu.queryByRole("menuitem", { name: "Preview as user" }),
    ).not.toBeInTheDocument();
  });
});
