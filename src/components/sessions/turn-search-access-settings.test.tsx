/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useLocaleStore } from "@/features/i18n/locale-store";
import { SessionSettings } from "./session-settings";
import { TurnSearchAccessSettings } from "./turn-search-access-settings";

afterEach(() => {
  cleanup();
  useLocaleStore.setState({ locale: "en" });
});

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
    screen.getByRole("button", { name: /Session search access/ }),
  ).toHaveTextContent("Only this agent");
  await user.click(
    screen.getByRole("button", { name: /Session search access/ }),
  );
  expect(onChange).not.toHaveBeenCalled();
  expect(
    screen.getByRole("switch", { name: "Preauthorize next turn" }),
  ).not.toBeChecked();
  await user.click(
    screen.getByRole("switch", { name: "Preauthorize next turn" }),
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

it("keeps preauthorization off under automatic request approval until the user explicitly selects it", async () => {
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
    screen.getByRole("button", { name: /Session search access/ }),
  ).toHaveTextContent("Auto-approve requests");
  await user.click(
    screen.getByRole("button", { name: /Session search access/ }),
  );
  expect(
    screen.getByRole("switch", { name: "Preauthorize next turn" }),
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
    screen.getByRole("button", { name: /Session search access/ }),
  ).toBeDisabled();
  expect(onChange).not.toHaveBeenCalled();
});

it.each([
  {
    state: "the default agent-only scope",
    autoApprove: false,
    value: undefined,
    summary: "仅当前智能体",
  },
  {
    state: "automatic approval only when requested",
    autoApprove: true,
    value: undefined,
    summary: "按需自动授权",
  },
  {
    state: "explicit next-turn preauthorization even with automatic approval",
    autoApprove: true,
    value: {
      queries: ["*"],
      agent_ids: ["*"],
      session_ids: ["*"],
    },
    summary: "下一轮已预授权",
  },
])(
  "explains $state in Chinese without granting access on entry",
  async ({ autoApprove, value, summary }) => {
    useLocaleStore.setState({ locale: "zh-CN" });
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <SessionSettings>
          <TurnSearchAccessSettings
            autoApprove={autoApprove}
            value={value}
            onChange={onChange}
          />
        </SessionSettings>
      </TooltipProvider>,
    );

    await user.click(screen.getByRole("button", { name: "会话设置" }));
    const searchAccess = screen.getByRole("button", { name: /会话搜索授权/ });
    expect(searchAccess).toHaveTextContent(summary);
    await user.click(searchAccess);

    expect(screen.getByRole("heading", { name: "会话搜索授权" })).toBeVisible();
    const preauthorization = screen.getByRole("switch", {
      name: "预先授权下一轮",
    });
    if (value) {
      expect(preauthorization).toBeChecked();
    } else {
      expect(preauthorization).not.toBeChecked();
    }
    if (autoApprove) {
      expect(
        screen.getByText(/智能体申请扩大搜索范围时，PAX 会自动批准申请/),
      ).toBeVisible();
    }
    expect(onChange).not.toHaveBeenCalled();
  },
);
