/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/features/api/client";
import { ApiError } from "@/features/api/errors";
import type { HarnessUsageView, LoginHarness } from "@/features/api/types";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  formatResetCountdown,
  HarnessUsagePanel,
  usageWindowLabel,
  usageWindowShortLabel,
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
      harness: "claude",
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

function panel(nodeId: string, harness: LoginHarness) {
  return <HarnessUsagePanel userId="self" nodeId={nodeId} harness={harness} />;
}

function mount(nodeId = "node-one", harness: LoginHarness = "claude") {
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
  return {
    rerender: (nextNode: string, nextHarness: LoginHarness) =>
      view.rerender(wrap(panel(nextNode, nextHarness))),
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

describe("usageWindowLabel", () => {
  it.each([
    [300, undefined, "5-hour limit", "5-hour"],
    [10080, undefined, "Weekly limit", "Weekly"],
    [10080, "Fable", "Weekly limit · Fable", "Weekly · Fable"],
    [120, undefined, "2-hour limit", "2-hour"],
    [2880, undefined, "2-day limit", "2-day"],
    [90, undefined, "90-minute limit", "90-minute"],
    [1500, undefined, "1500-minute limit", "1500-minute"],
    [0, "Opus", "Usage limit · Opus", "Usage · Opus"],
  ])(
    "labels %d minutes with scope %s as %s (row: %s)",
    (minutes, scope, label, short) => {
      const window = { window_minutes: minutes, scope };
      expect(usageWindowLabel(window)).toBe(label);
      expect(usageWindowShortLabel(window)).toBe(short);
    },
  );
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

it("renders each window with an accessible meter, reset time and freshness", async () => {
  fetchUsage.mockResolvedValue(
    usage({
      windows: [
        {
          id: "five_hour",
          window_minutes: 300,
          used_percent: 12.4,
          resets_at: new Date(now + (3 * 60 + 20) * 60_000).toISOString(),
        },
        {
          id: "seven_day",
          window_minutes: 10080,
          used_percent: 83,
          resets_at: new Date(now + (2 * 24 + 4) * 3_600_000).toISOString(),
        },
        {
          id: "seven_day_fable",
          window_minutes: 10080,
          scope: "Fable",
          used_percent: 100,
        },
      ],
      extra_usage: { enabled: false },
    }),
  );
  mount();
  const fiveHour = await screen.findByRole("meter", { name: "5-hour limit" });
  expect(fiveHour).toHaveAttribute("aria-valuenow", "12");
  expect(fiveHour).toHaveAttribute("aria-valuemin", "0");
  expect(fiveHour).toHaveAttribute("aria-valuemax", "100");
  expect(fiveHour).toHaveAttribute("aria-valuetext", "12% used");
  expect(screen.getByText("5-hour")).toBeInTheDocument();
  expect(screen.getByText("12%")).toBeInTheDocument();
  expect(screen.getByText("3h 20m")).toHaveTextContent("resets in 3h 20m");
  expect(screen.getByRole("meter", { name: "Weekly limit" })).toHaveAttribute(
    "aria-valuenow",
    "83",
  );
  expect(screen.getByText("2d 4h")).toHaveTextContent("resets in 2d 4h");
  expect(
    screen.getByRole("meter", { name: "Weekly limit · Fable" }),
  ).toHaveAttribute("aria-valuenow", "100");
  expect(screen.getByText("Weekly · Fable")).toBeInTheDocument();
  expect(screen.getAllByText("resets in")).toHaveLength(2);
  // Extra usage and freshness share the heading row instead of extra lines.
  expect(
    screen.getByText("Extra usage off · Updated 5m ago"),
  ).toBeInTheDocument();
});

it("reports extra usage that is turned on", async () => {
  fetchUsage.mockResolvedValue(
    usage({
      observed_at: new Date(now - 10_000).toISOString(),
      windows: [{ id: "seven_day", window_minutes: 10080, used_percent: 3 }],
      extra_usage: { enabled: true },
    }),
  );
  mount();
  expect(
    await screen.findByText("Extra usage on · Updated just now"),
  ).toBeInTheDocument();
});

it("explains when the plan has not reported any window yet", async () => {
  fetchUsage.mockResolvedValue(usage({ windows: [] }));
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
    "claude",
    "cli_unsupported",
    "Update Claude Code on this device to see plan usage.",
  ],
  [
    "codex",
    "cli_unsupported",
    "Update Codex on this device to see plan usage.",
  ],
  [
    "claude",
    "daemon_unsupported",
    "Update PAX on this device to see plan usage.",
  ],
  ["codex", "timeout", "Plan usage is unavailable right now."],
  ["claude", "read_failed", "Plan usage is unavailable right now."],
  ["claude", "something_new", "Plan usage is unavailable right now."],
] as const)(
  "explains unavailable %s usage with %s",
  async (harness, errorCode, text) => {
    fetchUsage.mockResolvedValue(
      usage({ harness, state: "unavailable", error_code: errorCode }),
    );
    mount("node-one", harness);
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
  },
);

it("treats an unknown state as unavailable instead of showing numbers", async () => {
  fetchUsage.mockResolvedValue(
    usage({
      state: "unexpected",
      windows: [{ id: "seven_day", window_minutes: 10080, used_percent: 3 }],
    }),
  );
  mount();
  expect(
    await screen.findByText("Plan usage is unavailable right now."),
  ).toBeInTheDocument();
  expect(screen.queryByRole("meter")).not.toBeInTheDocument();
});

it("shows only safe copy when the request fails and can retry", async () => {
  fetchUsage.mockRejectedValueOnce(
    new ApiError("node said something private", 502, {}),
  );
  const user = userEvent.setup();
  mount();
  expect(
    await screen.findByText("Plan usage could not be loaded."),
  ).toBeInTheDocument();
  expect(screen.queryByText(/private/)).not.toBeInTheDocument();
  fetchUsage.mockResolvedValue(
    usage({
      windows: [{ id: "seven_day", window_minutes: 10080, used_percent: 3 }],
    }),
  );
  await user.click(screen.getByRole("button", { name: "Refresh plan usage" }));
  expect(
    await screen.findByRole("meter", { name: "Weekly limit" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByText("Plan usage could not be loaded."),
  ).not.toBeInTheDocument();
});

it("refetches on refresh, disables the button meanwhile and keeps data on failure", async () => {
  fetchUsage.mockResolvedValueOnce(
    usage({
      windows: [{ id: "seven_day", window_minutes: 10080, used_percent: 3 }],
    }),
  );
  const user = userEvent.setup();
  mount();
  await screen.findByRole("meter", { name: "Weekly limit" });
  const next = deferred();
  fetchUsage.mockReturnValueOnce(next.promise as never);
  const refresh = screen.getByRole("button", { name: "Refresh plan usage" });
  await user.click(refresh);
  expect(fetchUsage).toHaveBeenCalledTimes(2);
  expect(refresh).toBeDisabled();
  await act(async () => {
    next.resolve(
      usage({
        observed_at: new Date(now).toISOString(),
        windows: [{ id: "seven_day", window_minutes: 10080, used_percent: 9 }],
      }),
    );
  });
  expect(await screen.findByText("9%")).toBeInTheDocument();
  expect(screen.getByText("Updated just now")).toBeInTheDocument();
  expect(refresh).toBeEnabled();

  fetchUsage.mockRejectedValueOnce(new ApiError("boom", 504, {}));
  await user.click(refresh);
  expect(
    await screen.findByText("Plan usage could not be refreshed."),
  ).toBeInTheDocument();
  expect(screen.getByText("9%")).toBeInTheDocument();
});

it.each([
  ["device", "node-two", "claude"],
  ["agent type", "node-one", "codex"],
] as const)(
  "never shows the previous usage after the %s changes",
  async (_label, nodeId, harness) => {
    fetchUsage.mockResolvedValueOnce(
      usage({
        windows: [{ id: "seven_day", window_minutes: 10080, used_percent: 3 }],
      }),
    );
    const view = mount();
    await screen.findByText("3%");
    const next = deferred();
    fetchUsage.mockReturnValueOnce(next.promise as never);
    view.rerender(nodeId, harness);
    expect(screen.queryByText("3%")).not.toBeInTheDocument();
    expect(screen.getByText("Checking plan usage…")).toBeInTheDocument();
    expect(fetchUsage).toHaveBeenLastCalledWith(
      `/api/v1/user/self/nodes/${nodeId}/harnesses/${harness}/usage`,
      expect.objectContaining({ cache: "no-store" }),
    );
    await act(async () => {
      next.resolve(
        usage({
          harness,
          windows: [{ id: "primary", window_minutes: 300, used_percent: 61 }],
        }),
      );
    });
    const section = screen.getByLabelText("Plan usage");
    expect(await within(section).findByText("61%")).toBeInTheDocument();
    expect(within(section).queryByText("3%")).not.toBeInTheDocument();
  },
);

// Exact Manager responses for views paxd read from real Claude Code and Codex CLIs.
it.each([
  {
    harness: "claude" as const,
    view: {
      harness: "claude" as const,
      state: "available",
      observed_at: "2026-11-12T19:14:20Z",
      plan: "max",
      windows: [
        {
          id: "seven_day",
          window_minutes: 10080,
          used_percent: 4,
          resets_at: "2026-11-16T09:00:00Z",
        },
        {
          id: "seven_day_fable",
          window_minutes: 10080,
          scope: "Fable",
          used_percent: 0,
          resets_at: "2026-11-16T09:00:00Z",
        },
      ],
      extra_usage: { enabled: false },
    },
    meters: [
      ["Weekly limit", "4"],
      ["Weekly limit · Fable", "0"],
    ],
    resets: "3d 13h",
    meta: "Extra usage off · Updated 5m ago",
  },
  {
    harness: "codex" as const,
    view: {
      harness: "codex" as const,
      state: "available",
      observed_at: "2026-11-12T19:14:22Z",
      plan: "pro",
      windows: [
        {
          id: "primary",
          window_minutes: 10080,
          used_percent: 31,
          resets_at: "2026-11-18T08:58:18Z",
        },
      ],
    },
    meters: [["Weekly limit", "31"]],
    resets: "5d 13h",
    meta: "Updated 5m ago",
  },
])(
  "renders the real $harness device response",
  async ({ harness, view, meters, resets, meta }) => {
    vi.setSystemTime(Date.parse(view.observed_at) + 5 * 60_000);
    fetchUsage.mockResolvedValue({ harness_usage: view });
    mount("node-one", harness);
    for (const [name, value] of meters) {
      expect(await screen.findByRole("meter", { name })).toHaveAttribute(
        "aria-valuenow",
        value,
      );
    }
    expect(screen.getAllByText(resets)).toHaveLength(meters.length);
    expect(screen.getByText(meta)).toBeInTheDocument();
    if (harness === "codex")
      expect(screen.queryByText(/Extra usage/)).not.toBeInTheDocument();
  },
);

it("ignores a response for a different harness", async () => {
  fetchUsage.mockResolvedValue(
    usage({
      harness: "codex",
      windows: [{ id: "primary", window_minutes: 300, used_percent: 61 }],
    }),
  );
  mount("node-one", "claude");
  expect(
    await screen.findByText("Plan usage is unavailable right now."),
  ).toBeInTheDocument();
  expect(screen.queryByText("61%")).not.toBeInTheDocument();
});
