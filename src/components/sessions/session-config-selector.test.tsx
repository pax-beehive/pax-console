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

  it("shows legacy model lists as read-only", async () => {
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
    expect(screen.getByText(/switching is not standardized/i)).toBeVisible();
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
