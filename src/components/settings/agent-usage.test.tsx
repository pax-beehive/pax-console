/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/features/api/client";
import { ApiError } from "@/features/api/errors";
import type { HarnessUsageView, LoginHarness } from "@/features/api/types";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  formatResetCountdown,
  formatUsageAmount,
  HarnessUsagePanel,
} from "./agent-usage";

vi.mock("@/features/api/client", async (load) => ({
  ...(await load<typeof import("@/features/api/client")>()),
  apiFetch: vi.fn(),
}));

const fetchUsage = vi.mocked(apiFetch);
const now = Date.parse("2026-11-12T12:00:00Z");
const clients: QueryClient[] = [];

function usage(view: Partial<HarnessUsageView> = {}) {
  return {
    harness_usage: {
      harness: "claude-code",
      state: "available",
      observed_at: new Date(now - 5 * 60_000).toISOString(),
      ...view,
    },
  };
}

function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function panel(nodeId: string, harness: LoginHarness, refreshKey = 0) {
  return (
    <HarnessUsagePanel
      userId="self"
      nodeId={nodeId}
      harness={harness}
      refreshKey={refreshKey}
    />
  );
}

function mount(nodeId = "node-one", harness: LoginHarness = "claude-code") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  const wrap = (children: ReactNode) => (
    <QueryClientProvider client={client}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
  const view = render(wrap(panel(nodeId, harness)));
  let refreshKey = 0;
  return {
    rerender: (nextNode: string, nextHarness: LoginHarness) =>
      view.rerender(wrap(panel(nextNode, nextHarness))),
    // The account card's Refresh bumps refreshKey to re-read usage.
    refresh: () => view.rerender(wrap(panel(nodeId, harness, ++refreshKey))),
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  fetchUsage.mockReset();
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.useRealTimers();
});

const weekly = (used_percent: number) => ({
  id: "seven_day",
  label: "Weekly",
  kind: "percent" as const,
  used_percent,
});

describe("formatUsageAmount", () => {
  it.each([
    [{ used: 12.4, limit: 50, unit: "usd" }, "12.40 / 50.00 USD"],
    [{ used: 12.4, unit: "eur" }, "12.40 EUR"],
    [{ used: 1234.5, limit: 2000, unit: "cny" }, "1,234.50 / 2,000.00 CNY"],
    [{ used: 1500.6, limit: 5000, unit: "credits" }, "1,501 / 5,000 credits"],
    [{ used: 300, unit: "tokens" }, "300 tokens"],
    [{ used: 7, limit: 10, unit: "requests" }, "7 / 10 requests"],
    [{ used: 3 }, "3"],
  ])("formats %j as %s", (item, text) => {
    expect(formatUsageAmount(item)).toBe(text);
  });
});

describe("formatResetCountdown", () => {
  const at = (ms: number) => new Date(now + ms).toISOString();
  it.each([
    [at((3 * 60 + 20) * 60_000 - 10_000), "3h 20m"],
    [at(3 * 3_600_000), "3h"],
    [at((2 * 24 + 4) * 3_600_000), "2d 4h"],
    [at(2 * 24 * 3_600_000), "2d"],
    [at(45 * 60_000), "45m"],
    [at(30_000), "soon"],
    [at(-60_000), "soon"],
  ])("formats %s as %s", (resetsAt, text) => {
    expect(formatResetCountdown(resetsAt, now)).toBe(text);
  });

  it("omits missing or invalid reset times", () => {
    expect(formatResetCountdown(undefined, now)).toBeUndefined();
    expect(formatResetCountdown("not a time", now)).toBeUndefined();
  });
});

it("reads usage for the device and harness and shows checking until it arrives", async () => {
  fetchUsage.mockReturnValue(new Promise(() => {}));
  mount("node/one", "codex");
  expect(await screen.findByText("Checking plan usage…")).toBeInTheDocument();
  expect(fetchUsage).toHaveBeenCalledWith(
    "/api/v1/user/self/nodes/node%2Fone/harnesses/codex/usage",
    expect.objectContaining({ cache: "no-store" }),
  );
});

it("renders percent items with an accessible meter, reset time and freshness", async () => {
  fetchUsage.mockResolvedValue(
    usage({
      items: [
        {
          id: "five_hour",
          label: "5-hour",
          kind: "percent",
          used_percent: 12.4,
          window_minutes: 300,
          resets_at: new Date(now + (3 * 60 + 20) * 60_000).toISOString(),
        },
        {
          id: "seven_day",
          label: "Weekly",
          kind: "percent",
          used_percent: 83,
          resets_at: new Date(now + (2 * 24 + 4) * 3_600_000).toISOString(),
        },
        {
          id: "seven_day_fable",
          label: "Weekly · Fable",
          kind: "percent",
          used_percent: 100,
        },
      ],
    }),
  );
  mount();
  const fiveHour = await screen.findByRole("meter", { name: "5-hour" });
  expect(fiveHour).toHaveAttribute("aria-valuenow", "12");
  expect(fiveHour).toHaveAttribute("aria-valuemin", "0");
  expect(fiveHour).toHaveAttribute("aria-valuemax", "100");
  expect(fiveHour).toHaveAttribute("aria-valuetext", "12% used");
  expect(screen.getByText("12% used")).toBeInTheDocument();
  expect(screen.getByText("3h 20m")).toHaveTextContent("resets in 3h 20m");
  expect(screen.getByRole("meter", { name: "Weekly" })).toHaveAttribute(
    "aria-valuenow",
    "83",
  );
  expect(screen.getByText("2d 4h")).toHaveTextContent("resets in 2d 4h");
  expect(screen.getByRole("meter", { name: "Weekly · Fable" })).toHaveAttribute(
    "aria-valuenow",
    "100",
  );
  expect(screen.getAllByText("resets in")).toHaveLength(2);
  expect(screen.getByText("Updated 5m ago")).toBeInTheDocument();
});

it("colours bars by reported severity, falling back to the share used", async () => {
  fetchUsage.mockResolvedValue(
    usage({
      items: [
        { id: "a", label: "Low", kind: "percent", used_percent: 10 },
        { id: "b", label: "High", kind: "percent", used_percent: 85 },
        { id: "c", label: "Full", kind: "percent", used_percent: 100 },
        {
          id: "d",
          label: "Flagged",
          kind: "percent",
          used_percent: 20,
          severity: "critical",
        },
      ],
    }),
  );
  mount();
  const bar = async (name: string) =>
    (await screen.findByRole("meter", { name })).firstElementChild;
  expect(await bar("Low")).toHaveClass("bg-primary");
  expect(await bar("High")).toHaveClass("bg-warning");
  expect(await bar("Full")).toHaveClass("bg-danger");
  expect(await bar("Flagged")).toHaveClass("bg-danger");
});

it("renders amount items with and without a limit", async () => {
  fetchUsage.mockResolvedValue(
    usage({
      items: [
        {
          id: "api_credits",
          label: "API credits",
          kind: "amount",
          used: 12.4,
          limit: 50,
          unit: "usd",
        },
        {
          id: "tokens",
          label: "Tokens",
          kind: "amount",
          used: 300,
          unit: "tokens",
        },
      ],
    }),
  );
  mount();
  const credits = await screen.findByRole("meter", { name: "API credits" });
  expect(credits).toHaveAttribute("aria-valuenow", "25");
  expect(credits).toHaveAttribute("aria-valuetext", "12.40 / 50.00 USD");
  expect(screen.getByText("12.40 / 50.00 USD")).toBeInTheDocument();
  expect(screen.getByText("300 tokens")).toBeInTheDocument();
  expect(
    screen.queryByRole("meter", { name: "Tokens" }),
  ).not.toBeInTheDocument();
});

it("renders status items and skips unknown kinds", async () => {
  fetchUsage.mockResolvedValue(
    usage({
      items: [
        weekly(3),
        {
          id: "extra_usage",
          label: "Extra usage",
          kind: "status",
          value: "off",
        },
        { id: "future", label: "Future", kind: "histogram" } as never,
      ],
    }),
  );
  mount();
  expect(await screen.findByText("Extra usage")).toBeInTheDocument();
  expect(screen.getByText("off")).toBeInTheDocument();
  expect(screen.queryByText("Future")).not.toBeInTheDocument();
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
});

it("explains when the plan has not reported any usage yet", async () => {
  fetchUsage.mockResolvedValue(usage({ items: [] }));
  mount();
  expect(
    await screen.findByText("No plan usage reported yet."),
  ).toBeInTheDocument();
  expect(screen.queryByRole("meter")).not.toBeInTheDocument();
});

it("explains sign-in methods without plan limits", async () => {
  fetchUsage.mockResolvedValue(usage({ state: "unsupported" }));
  mount();
  expect(
    await screen.findByText("This sign-in method does not report plan usage."),
  ).toBeInTheDocument();
});

it.each([
  [
    "claude-code",
    "Claude Code",
    "cli_unsupported",
    "Update Claude Code on this device to see plan usage.",
  ],
  [
    "opencode",
    "OpenCode",
    "cli_unsupported",
    "Update OpenCode on this device to see plan usage.",
  ],
  [
    "kimi",
    undefined,
    "cli_unsupported",
    "Update Kimi on this device to see plan usage.",
  ],
  [
    "claude-code",
    undefined,
    "daemon_unsupported",
    "Update PAX on this device to see plan usage.",
  ],
  ["codex", "Codex", "timeout", "Plan usage is unavailable right now."],
  ["codex", "Codex", "something_new", "Plan usage is unavailable right now."],
] as const)(
  "explains unavailable %s usage (label %s) with %s",
  async (harness, label, errorCode, text) => {
    fetchUsage.mockResolvedValue(
      usage({
        harness,
        ...(label ? { harness_label: label } : {}),
        state: "unavailable",
        error_code: errorCode,
      }),
    );
    mount("node-one", harness);
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
  },
);

it("treats an unknown state as unavailable instead of showing numbers", async () => {
  fetchUsage.mockResolvedValue(
    usage({ state: "unexpected", items: [weekly(3)] }),
  );
  mount();
  expect(
    await screen.findByText("Plan usage is unavailable right now."),
  ).toBeInTheDocument();
  expect(screen.queryByRole("meter")).not.toBeInTheDocument();
});

it("shows only safe copy when the request fails and retries on refresh", async () => {
  fetchUsage.mockRejectedValueOnce(
    new ApiError("node said something private", 502, {}),
  );
  const view = mount();
  expect(
    await screen.findByText("Plan usage could not be loaded."),
  ).toBeInTheDocument();
  expect(screen.queryByText(/private/)).not.toBeInTheDocument();
  fetchUsage.mockResolvedValue(usage({ items: [weekly(3)] }));
  view.refresh();
  expect(
    await screen.findByRole("meter", { name: "Weekly" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByText("Plan usage could not be loaded."),
  ).not.toBeInTheDocument();
});

it("refetches when refreshKey changes, shows updating meanwhile and keeps data on failure", async () => {
  fetchUsage.mockResolvedValueOnce(usage({ items: [weekly(3)] }));
  const view = mount();
  await screen.findByRole("meter", { name: "Weekly" });
  const next = deferred();
  fetchUsage.mockReturnValueOnce(next.promise as never);
  view.refresh();
  await waitFor(() => expect(fetchUsage).toHaveBeenCalledTimes(2));
  expect(screen.getByText("Updating…")).toBeInTheDocument();
  await act(async () => {
    next.resolve(
      usage({ observed_at: new Date(now).toISOString(), items: [weekly(9)] }),
    );
  });
  expect(await screen.findByText("9% used")).toBeInTheDocument();
  expect(screen.getByText("Updated just now")).toBeInTheDocument();

  fetchUsage.mockRejectedValueOnce(new ApiError("boom", 504, {}));
  view.refresh();
  expect(
    await screen.findByText("Plan usage could not be refreshed."),
  ).toBeInTheDocument();
  expect(screen.getByText("9% used")).toBeInTheDocument();
});

it.each([
  ["device", "node-two", "claude-code"],
  ["agent type", "node-one", "codex"],
] as const)(
  "never shows the previous usage after the %s changes",
  async (_label, nodeId, harness) => {
    fetchUsage.mockResolvedValueOnce(usage({ items: [weekly(3)] }));
    const view = mount();
    await screen.findByText("3% used");
    const next = deferred();
    fetchUsage.mockReturnValueOnce(next.promise as never);
    view.rerender(nodeId, harness);
    expect(screen.queryByText("3% used")).not.toBeInTheDocument();
    expect(screen.getByText("Checking plan usage…")).toBeInTheDocument();
    expect(fetchUsage).toHaveBeenLastCalledWith(
      `/api/v1/user/self/nodes/${nodeId}/harnesses/${harness}/usage`,
      expect.objectContaining({ cache: "no-store" }),
    );
    await act(async () => {
      next.resolve(
        usage({
          harness,
          items: [
            {
              id: "primary",
              label: "5-hour",
              kind: "percent",
              used_percent: 61,
            },
          ],
        }),
      );
    });
    const section = screen.getByLabelText("Plan usage");
    expect(await within(section).findByText("61% used")).toBeInTheDocument();
    expect(within(section).queryByText("3% used")).not.toBeInTheDocument();
  },
);

it("ignores a response for a different harness", async () => {
  fetchUsage.mockResolvedValue(
    usage({
      harness: "codex",
      items: [
        { id: "primary", label: "5-hour", kind: "percent", used_percent: 61 },
      ],
    }),
  );
  mount("node-one", "claude-code");
  expect(
    await screen.findByText("Plan usage is unavailable right now."),
  ).toBeInTheDocument();
  expect(screen.queryByText("61% used")).not.toBeInTheDocument();
});
