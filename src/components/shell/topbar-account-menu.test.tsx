/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
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

async function openMenu(role = "user") {
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <Topbar
        user={{ user_id: "menu-user", email: "alex@example.invalid", role }}
      />
    </TooltipProvider>,
  );
  await user.click(screen.getByRole("button", { name: "User menu" }));
  return { user, menu: within(screen.getByRole("menu")) };
}

afterEach(() => {
  cleanup();
  account.region = undefined;
  useConsoleStore.setState({ previewAsUser: false });
  vi.clearAllMocks();
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

  it("reaches settings and support without leaving the menu's first screen", async () => {
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

  it("signs out from the last entry", async () => {
    const { user, menu } = await openMenu();
    await user.click(menu.getByRole("menuitem", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledOnce();
  });
});
