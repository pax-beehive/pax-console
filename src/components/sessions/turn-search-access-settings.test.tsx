/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionSettings } from "./session-settings";
import { TurnSearchAccessSettings } from "./turn-search-access-settings";

afterEach(cleanup);

it("requires an explicit choice and allows one-turn keyword and session scopes", async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <SessionSettings summary="Ask">
        <TurnSearchAccessSettings onChange={onChange} />
      </SessionSettings>
    </TooltipProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Session settings" }));
  expect(
    screen.getByRole("button", { name: /Expand search scope/ }),
  ).toHaveTextContent("Own agent");
  await user.click(screen.getByRole("button", { name: /Expand search scope/ }));
  expect(onChange).not.toHaveBeenCalled();
  expect(
    screen.getByRole("switch", { name: "Expand scope for next turn" }),
  ).not.toBeChecked();
  await user.click(
    screen.getByRole("switch", { name: "Expand scope for next turn" }),
  );
  await user.clear(screen.getByLabelText("Allowed queries"));
  await user.type(
    screen.getByLabelText("Allowed queries"),
    "cicd{enter}deployment notes",
  );
  await user.clear(screen.getByLabelText("Agents"));
  await user.type(screen.getByLabelText("Agents"), "agent_other");
  await user.click(screen.getByRole("button", { name: "Apply for next turn" }));
  expect(onChange).toHaveBeenCalledWith({
    queries: ["cicd", "deployment notes"],
    agent_ids: ["agent_other"],
    session_ids: ["*"],
  });
});

it("keeps preauthorization off under auto expansion until the user explicitly selects it", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <TooltipProvider>
      <SessionSettings summary="Auto approve">
        <TurnSearchAccessSettings autoApprove onChange={onChange} />
      </SessionSettings>
    </TooltipProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Session settings" }));
  expect(
    screen.getByRole("button", { name: /Expand search scope/ }),
  ).toHaveTextContent("Auto expansion");
  await user.click(screen.getByRole("button", { name: /Expand search scope/ }));
  expect(
    screen.getByRole("switch", { name: "Expand scope for next turn" }),
  ).not.toBeChecked();
  expect(screen.queryByLabelText("Agents")).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});

it("does not expose preauthorization for encrypted sessions", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <TooltipProvider>
      <SessionSettings summary="Encrypted">
        <TurnSearchAccessSettings disabled onChange={onChange} />
      </SessionSettings>
    </TooltipProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Session settings" }));
  expect(
    screen.getByRole("button", { name: /Expand search scope/ }),
  ).toBeDisabled();
  expect(onChange).not.toHaveBeenCalled();
});
