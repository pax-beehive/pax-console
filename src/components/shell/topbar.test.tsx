/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  LOCALE_STORAGE_KEY,
  useLocaleStore,
} from "@/features/i18n/locale-store";
import { Topbar } from "./topbar";

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("@/features/api/client", () => ({ signOut }));

function mount() {
  render(
    <TooltipProvider>
      <Topbar
        user={{
          user_id: "menu-user",
          email: "alex@example.invalid",
          role: "user",
        }}
      />
    </TooltipProvider>,
  );
}

afterEach(() => {
  cleanup();
  useLocaleStore.setState({ locale: "en" });
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
