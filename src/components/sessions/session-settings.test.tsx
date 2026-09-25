/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { SessionSettings, SessionSettingsHome } from "./session-settings";
import { SessionConfigSelector } from "./session-config-selector";
import { SessionPermissionSelector } from "./session-permission-selector";

afterEach(cleanup);
function setup(disabled = false) {
  const change = vi.fn();
  const permission = vi.fn();
  render(
    <SessionSettings summary="6 Astra · Ask">
      <SessionSettingsHome>
        <span>Creation-only option</span>
      </SessionSettingsHome>
      <SessionConfigSelector
        inline
        configuration={{
          session_id: "s",
          can_set: true,
          can_force_refresh: true,
          options: [
            {
              id: "model",
              name: "Model",
              type: "select",
              current_value: "astra",
              options: [
                { name: "6 Astra", value: "astra" },
                { name: "Sol", value: "sol" },
              ],
            },
            {
              id: "fast",
              name: "Fast mode",
              type: "boolean",
              current_value: false,
            },
          ],
        }}
        disabled={disabled}
        onChange={change}
        onRefresh={vi.fn()}
      />
      <SessionPermissionSelector
        field
        value="agent:ask"
        choices={[
          { choice_id: "agent:ask", kind: "agent", label: "Ask" },
          {
            choice_id: "agent:full",
            kind: "agent",
            label: "Full access",
            description: "Unrestricted access to files and the internet.",
            requires_confirmation: true,
          },
        ]}
        onChange={permission}
      />
    </SessionSettings>,
  );
  return { change, permission };
}
it("uses one panel for settings and choices, selects then returns, and resets on reopen", async () => {
  const { change } = setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Session settings" }));
  await user.click(screen.getByRole("button", { name: "Model: 6 Astra" }));
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(screen.getByRole("dialog", { name: "Model" })).toBeVisible();
  expect(screen.queryByText("Creation-only option")).not.toBeInTheDocument();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "6 Astra" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await user.click(screen.getByRole("radio", { name: "Sol" }));
  expect(change).toHaveBeenCalledWith("model", "sol");
  expect(
    screen.getByRole("dialog", { name: "Session settings" }),
  ).toBeVisible();
  await user.click(screen.getByRole("switch", { name: "Fast mode" }));
  expect(change).toHaveBeenCalledWith("fast", true);
  await user.click(screen.getByRole("button", { name: "Model: 6 Astra" }));
  await user.keyboard("{Escape}");
  expect(
    screen.getByRole("dialog", { name: "Session settings" }),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Model: 6 Astra" }));
  await user.click(screen.getByRole("button", { name: "Close settings" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Session settings" }),
  ).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Session settings" }));
  expect(
    screen.getByRole("dialog", { name: "Session settings" }),
  ).toBeVisible();
});
it("confirms broad permissions in the same panel, supports cancellation, and never commits early", async () => {
  const { permission } = setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Session settings" }));
  await user.click(
    screen.getByRole("button", { name: "Session permissions: Ask" }),
  );
  await user.click(screen.getByRole("radio", { name: /Full access/ }));
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(permission).not.toHaveBeenCalled();
  const confirm = screen.getByRole("dialog", { name: "Use Full access?" });
  await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("dialog", { name: "Permissions" })).toBeVisible();
  expect(permission).not.toHaveBeenCalled();
  await user.click(screen.getByRole("radio", { name: /Full access/ }));
  await user.click(screen.getByRole("button", { name: "Use this permission" }));
  expect(permission).toHaveBeenCalledExactlyOnceWith("agent:full");
  expect(
    screen.getByRole("dialog", { name: "Session settings" }),
  ).toBeVisible();
});
it("keeps unavailable config controls disabled", async () => {
  setup(true);
  await userEvent.click(
    screen.getByRole("button", { name: "Session settings" }),
  );
  expect(screen.getByRole("button", { name: "Model: 6 Astra" })).toBeDisabled();
  expect(screen.getByRole("switch", { name: "Fast mode" })).toBeDisabled();
});

it("supports keyboard choice navigation without committing until activated", async () => {
  const { change } = setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Session settings" }));
  await user.click(screen.getByRole("button", { name: "Model: 6 Astra" }));
  screen.getByRole("radio", { name: "6 Astra" }).focus();
  await user.keyboard("{ArrowDown}");
  expect(screen.getByRole("radio", { name: "Sol" })).toHaveFocus();
  expect(change).not.toHaveBeenCalled();
  await user.keyboard("{Enter}");
  expect(change).toHaveBeenCalledExactlyOnceWith("model", "sol");
});
