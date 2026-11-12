/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionSettings } from "./session-settings";
import { TurnSearchAccessSettings } from "./turn-search-access-settings";

afterEach(cleanup);

it("requires an explicit choice and allows one-turn query, node, agent and session scopes", async () => {
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
  ).toHaveTextContent("Own node");
  await user.click(screen.getByRole("button", { name: /Expand search scope/ }));
  expect(onChange).not.toHaveBeenCalled();
  expect(
    screen.getByRole("switch", { name: "Expand scope for next turn" }),
  ).not.toBeChecked();
  await user.click(
    screen.getByRole("switch", { name: "Expand scope for next turn" }),
  );
  expect(screen.getByLabelText("Allowed nodes")).toHaveValue("*");
  await user.clear(screen.getByLabelText("Allowed nodes"));
  await user.type(screen.getByLabelText("Allowed nodes"), "node_other");
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
    node_ids: ["node_other"],
    agent_ids: ["agent_other"],
    session_ids: ["*"],
  });
});

it("preserves all-node access when editing a legacy preauthorization", async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <SessionSettings summary="Ask">
        <TurnSearchAccessSettings
          value={{ queries: ["cicd"], agent_ids: ["self"], session_ids: ["*"] }}
          onChange={onChange}
        />
      </SessionSettings>
    </TooltipProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Session settings" }));
  await user.click(screen.getByRole("button", { name: /Expand search scope/ }));
  expect(screen.getByLabelText("Allowed nodes")).toHaveValue("*");
  await user.click(screen.getByRole("button", { name: "Apply for next turn" }));
  expect(onChange).toHaveBeenCalledWith({
    queries: ["cicd"],
    node_ids: ["*"],
    agent_ids: ["self"],
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
  expect(screen.queryByLabelText("Allowed nodes")).not.toBeInTheDocument();
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
