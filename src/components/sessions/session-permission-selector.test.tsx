/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PAX_MANUAL_CHOICE_ID } from "@/features/permissions/permission-catalog";
import { SessionPermissionSelector } from "./session-permission-selector";

afterEach(() => cleanup());

const confirmationCatalog = {
  catalog_revision: 1,
  choices: [],
  default_choice_id: "agent:full-access",
  source: "profile" as const,
  stale: false,
};

const confirmationChoices = [
  {
    choice_id: "pax:auto_approve",
    kind: "pax" as const,
    label: "Auto approve (PAX)",
  },
  {
    choice_id: "agent:full-access",
    kind: "agent" as const,
    label: "Full access",
    requires_confirmation: true,
  },
];

describe("SessionPermissionSelector", () => {
  it("keeps a confirmation-required default on manual until explicitly confirmed", async () => {
    const onChange = vi.fn();

    render(
      <SessionPermissionSelector
        catalog={confirmationCatalog}
        choices={confirmationChoices}
        onChange={onChange}
        value={PAX_MANUAL_CHOICE_ID}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: "Session permissions: Ask before tools",
      }),
    );
    expect(
      screen.getByRole("radio", { name: /Ask before tools/ }),
    ).toHaveAttribute("aria-checked", "true");
    const fullAccess = screen.getByRole("radio", {
      name: /Full access/,
    });
    expect(fullAccess).toHaveAttribute("aria-checked", "false");

    await userEvent.click(fullAccess);
    expect(onChange).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Use Full access?" }),
    ).toBeVisible();

    await userEvent.click(
      screen.getByRole("button", { name: "Use this permission" }),
    );
    expect(onChange).toHaveBeenCalledWith("agent:full-access");
  });

  it("commits a displayed manual fallback and explains catalog errors", async () => {
    const onChange = vi.fn();

    render(
      <SessionPermissionSelector
        choices={confirmationChoices}
        error
        onChange={onChange}
        value={PAX_MANUAL_CHOICE_ID}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: "Session permissions: Ask before tools",
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Agent permissions are unavailable. Using PAX fallback controls.",
    );

    await userEvent.click(
      screen.getByRole("radio", { name: /Ask before tools/ }),
    );
    expect(onChange).toHaveBeenCalledWith(PAX_MANUAL_CHOICE_ID);
  });
});

it("does not commit a permission removed while confirmation is open", async () => {
  const onChange = vi.fn();
  const props = {
    catalog: confirmationCatalog,
    choices: confirmationChoices,
    onChange,
    value: PAX_MANUAL_CHOICE_ID,
  };
  const { rerender } = render(<SessionPermissionSelector {...props} />);
  await userEvent.click(
    screen.getByRole("button", {
      name: "Session permissions: Ask before tools",
    }),
  );
  await userEvent.click(screen.getByRole("radio", { name: /Full access/ }));
  rerender(<SessionPermissionSelector {...props} choices={[]} />);
  expect(screen.getByRole("status")).toHaveTextContent("no longer available");
  expect(
    screen.getByRole("button", { name: "Use this permission" }),
  ).toBeDisabled();
  expect(onChange).not.toHaveBeenCalled();
});
