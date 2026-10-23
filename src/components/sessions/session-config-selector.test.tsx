/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionConfigSelector } from "./session-config-selector";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    },
  );
});

afterAll(() => vi.unstubAllGlobals());
afterEach(() => cleanup());

function renderWithTooltip(ui: Parameters<typeof render>[0]) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe("SessionConfigSelector", () => {
  it("shows current model and changes dynamic model, thought, and boolean options", async () => {
    const onChange = vi.fn();
    renderWithTooltip(
      <SessionConfigSelector
        configuration={{
          can_force_refresh: true,
          can_set: true,
          observed_at: "2026-09-05T12:00:00Z",
          options: [
            {
              category: "model",
              current_value: "gpt-6",
              id: "model",
              name: "Model",
              options: [
                { name: "GPT-6", value: "gpt-6" },
                { name: "GPT-5.6 Sol", value: "gpt-5.6-sol" },
              ],
              type: "select",
            },
            {
              category: "thought_level",
              current_value: "medium",
              id: "reasoning_effort",
              name: "Thinking",
              options: [
                { name: "Medium", value: "medium" },
                { name: "High", value: "high" },
              ],
              type: "select",
            },
            {
              current_value: false,
              id: "fast",
              name: "Fast mode",
              type: "boolean",
            },
          ],
          session_id: "sess_1",
        }}
        onChange={onChange}
        onRefresh={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: "Session configuration, model GPT-6",
      }),
    );
    expect(screen.getByText("Thinking")).toBeVisible();
    expect(screen.getByText("Fast mode")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Thinking: Medium" }),
    );
    await userEvent.click(screen.getByRole("radio", { name: "High" }));
    await userEvent.click(screen.getByRole("switch", { name: "Fast mode" }));
    expect(onChange).toHaveBeenCalledWith("fast", true);
    expect(onChange).toHaveBeenCalledWith("reasoning_effort", "high");
  });

  it("keeps legacy models read-only when Manager exposes no selectable option", async () => {
    renderWithTooltip(
      <SessionConfigSelector
        configuration={{
          can_force_refresh: false,
          can_set: false,
          legacy_models: {
            available: [
              {
                id: "deepseek:v4",
                name: "DeepSeek V4",
                description: "Flagship reasoning model",
              },
              { id: "deepseek:flash", name: "DeepSeek Flash" },
            ],
            current_model_id: "deepseek:v4",
          },
          options: [],
          session_id: "sess_2",
        }}
        onChange={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: "Session configuration, model DeepSeek V4",
      }),
    );
    expect(screen.getByRole("button", { name: "Legacy model" })).toBeDisabled();
    expect(screen.getByText("Flagship reasoning model")).toBeVisible();
    const current = screen.getByRole("radio", { name: /DeepSeek V4/ });
    expect(current).toBeDisabled();
    expect(current).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("radio", { name: /DeepSeek Flash/ }),
    ).toBeDisabled();
    expect(screen.getByText(/model switching is unavailable/i)).toBeVisible();
  });

  it("switches a Manager-normalized legacy model and waits for the confirmed snapshot", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const configuration = {
      can_force_refresh: false,
      can_set: true,
      legacy_models: {
        current_model_id: "provider:old",
        available: [
          { id: "provider:old", name: "Old model" },
          { id: "provider:new", name: "New model" },
        ],
      },
      options: [
        {
          id: "model",
          name: "Model",
          category: "model",
          type: "select",
          current_value: "provider:old",
          options: [
            { value: "provider:old", name: "Old model" },
            { value: "provider:new", name: "New model" },
          ],
        },
      ],
      session_id: "sess_legacy",
    };
    const view = renderWithTooltip(
      <SessionConfigSelector
        configuration={configuration}
        onChange={onChange}
        onRefresh={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", {
        name: "Session configuration, model Old model",
      }),
    );
    expect(
      screen.queryByRole("button", { name: "Legacy model" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Force refresh session configuration",
      }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Model: Old model" }));
    await user.click(screen.getByRole("radio", { name: "New model" }));
    expect(onChange).toHaveBeenCalledWith("model", "provider:new");
    expect(
      screen.getByRole("button", { name: "Model: Old model" }),
    ).toBeVisible();
    view.rerender(
      <TooltipProvider>
        <SessionConfigSelector
          configuration={{
            ...configuration,
            legacy_models: {
              ...configuration.legacy_models,
              current_model_id: "provider:new",
            },
            options: [
              { ...configuration.options[0], current_value: "provider:new" },
            ],
          }}
          onChange={onChange}
          onRefresh={vi.fn()}
        />
      </TooltipProvider>,
    );
    expect(
      screen.getByRole("button", { name: "Model: New model" }),
    ).toBeVisible();
  });

  it("shows a model option's description inline without the group", async () => {
    renderWithTooltip(
      <SessionConfigSelector
        configuration={{
          can_force_refresh: false,
          can_set: true,
          options: [
            {
              category: "model",
              current_value: "claude-sonnet",
              description: "AI model to use",
              id: "model",
              name: "Model",
              options: [
                {
                  name: "Sonnet",
                  value: "claude-sonnet",
                  description: "Balanced everyday model",
                  group: "Anthropic",
                },
                {
                  name: "Opus",
                  value: "claude-opus",
                  description: "Most capable model",
                  group: "Anthropic",
                },
              ],
              type: "select",
            },
          ],
          session_id: "sess_inline",
        }}
        onChange={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: "Session configuration, model Sonnet",
      }),
    );

    await userEvent.hover(
      screen.getByRole("button", { name: "Model: Sonnet" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("tooltip")).toHaveTextContent("AI model to use"),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Model: Sonnet" }),
    );

    expect(screen.getByText("Balanced everyday model")).toBeVisible();
    expect(screen.getByText("Most capable model")).toBeVisible();
    expect(screen.queryByText("Anthropic")).not.toBeInTheDocument();
  });
});
