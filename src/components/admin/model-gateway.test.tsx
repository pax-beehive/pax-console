/* @vitest-environment jsdom */

import React from "react";
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthError, ApiError } from "@/features/api/errors";
import {
  changeHostingAdmin,
  hostingAdminKey,
  readHostingAdmin,
  type HostingAdminSnapshot,
} from "@/features/api/hosting-admin";
import type { User } from "@/features/api/types";
import { useLocaleStore } from "@/features/i18n/locale-store";
import { useConsoleStore } from "@/stores/console-store";
import { ModelGatewayAccess } from "./model-gateway";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/model-gateway",
}));
vi.mock("@/features/api/hosting-admin", async (original) => ({
  ...(await original<typeof import("@/features/api/hosting-admin")>()),
  readHostingAdmin: vi.fn(),
  changeHostingAdmin: vi.fn(),
}));

const admin: User = {
  user_id: "usr_admin",
  name: "Administrator",
  is_admin: true,
} as User;
const ordinary: User = {
  user_id: "usr_admin",
  name: "User",
  is_admin: false,
} as User;

function snapshot(): HostingAdminSnapshot {
  return {
    revision: 7,
    enabled: true,
    pool: {
      monthly_limit_microusd: 100_000_000,
      spent_microusd: 1_000_000,
      reserved_microusd: 500_000,
      remaining_microusd: 98_500_000,
      period_start: "2026-11-01T00:00:00Z",
      resets_at: "2026-12-01T00:00:00Z",
      available: true,
    },
    defaults: { monthly_microusd: 5_000_000, monthly_tokens: 200_000 },
    users: [
      {
        user_id: "usr_trial",
        name: "Free Agent",
        email: "trial@example.com",
        environment_id: "env_trial",
        access_paused: false,
        monthly_microusd: 5_000_000,
        monthly_tokens: 200_000,
        quota: {
          granted_microusd: 5_000_000,
          spent_microusd: 1_000_000,
          reserved_microusd: 500_000,
          remaining_microusd: 3_500_000,
          granted_tokens: 200_000,
          spent_tokens: 1_000,
          reserved_tokens: 1_000,
          remaining_tokens: 198_000,
          period_start: "2026-11-01T00:00:00Z",
          resets_at: "2026-12-01T00:00:00Z",
        },
      },
    ],
    models: [
      {
        id: "free-frontier",
        provider: "openrouter",
        upstream_model: "vendor/frontier",
        moderation: "openai",
        policy_version: "v1",
        max_output_tokens: 10_000,
        input_microusd_per_million: 3_000_000,
        output_microusd_per_million: 15_000_000,
        enabled: true,
      },
    ],
    model_bases: { "free-frontier": "base-v1" },
    requests: [
      {
        id: "record_1",
        request_id: "request_1",
        environment_id: "env_trial",
        user_id: "usr_trial",
        model: "free-frontier",
        provider: "openrouter",
        upstream_model: "vendor/frontier",
        status: "moderation_blocked",
        moderation_verdict: "blocked",
        spent_microusd: 0,
        reserved_microusd: 0,
        tokens: 0,
        input_tokens: 0,
        output_tokens: 0,
        created_at: "2026-11-13T10:00:00Z",
        generation_started: false,
        error_code: "moderation_blocked",
      },
    ],
    audit: [
      {
        actor_user_id: "usr_operator",
        action: "pool",
        target_id: "",
        revision: 7,
        created_at: "2026-11-13T09:00:00Z",
      },
    ],
  };
}

function setup(user = admin, cached?: HostingAdminSnapshot) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  if (cached)
    client.setQueryData([...hostingAdminKey(user.user_id), {}], cached);
  const ui = (profile: User) => (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <ModelGatewayAccess user={profile} />
      </TooltipProvider>
    </QueryClientProvider>
  );
  const view = render(ui(user));
  return { client, rerender: (profile: User) => view.rerender(ui(profile)) };
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  useLocaleStore.setState({ locale: "en" });
  useConsoleStore.setState({ previewAsUser: false });
  vi.mocked(readHostingAdmin).mockReset().mockResolvedValue(snapshot());
  vi.mocked(changeHostingAdmin)
    .mockReset()
    .mockResolvedValue({ ...snapshot(), revision: 8 });
});
afterEach(() => {
  cleanup();
  useLocaleStore.setState({ locale: "en" });
  vi.unstubAllGlobals();
});

describe("model gateway administrator access", () => {
  it.each(["ordinary", "preview"])(
    "does not mount a query or expose cached settings for %s view",
    (mode) => {
      if (mode === "preview") useConsoleStore.setState({ previewAsUser: true });
      setup(mode === "ordinary" ? ordinary : admin, snapshot());
      expect(screen.getByRole("alert")).toHaveTextContent("administrators");
      expect(
        screen.queryByRole("heading", { name: "Platform pool" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("trial@example.com")).not.toBeInTheDocument();
      expect(readHostingAdmin).not.toHaveBeenCalled();
    },
  );

  it.each(["role", "preview"])(
    "hides loaded data and removes its cache after losing the %s view",
    async (mode) => {
      const { client, rerender } = setup();
      await screen.findByText("trial@example.com");
      if (mode === "role") rerender(ordinary);
      else act(() => useConsoleStore.setState({ previewAsUser: true }));
      expect(screen.getByRole("alert")).toHaveTextContent("Access denied");
      expect(screen.queryByText("trial@example.com")).not.toBeInTheDocument();
      await waitFor(() =>
        expect(
          client.getQueriesData({ queryKey: hostingAdminKey(admin.user_id) }),
        ).toEqual([]),
      );
    },
  );

  it("clears cached data after a forbidden refresh and does not retry", async () => {
    const { client } = setup();
    await screen.findByText("trial@example.com");
    vi.mocked(readHostingAdmin).mockRejectedValue(new AuthError());
    fireEvent.click(screen.getByRole("button", { name: "Refresh settings" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Access denied");
    expect(screen.queryByText("trial@example.com")).not.toBeInTheDocument();
    expect(
      client.getQueriesData({ queryKey: hostingAdminKey(admin.user_id) }),
    ).toEqual([]);
    expect(readHostingAdmin).toHaveBeenCalledTimes(2);
  });

  it("hides and clears data after a forbidden save", async () => {
    const { client } = setup();
    await screen.findByLabelText("Platform monthly budget (USD)");
    vi.mocked(changeHostingAdmin).mockRejectedValue(new AuthError());
    fireEvent.change(screen.getByLabelText("Platform monthly budget (USD)"), {
      target: { value: "200" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save platform pool" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Access denied");
    expect(
      client.getQueriesData({ queryKey: hostingAdminKey(admin.user_id) }),
    ).toEqual([]);
  });
});

describe("model gateway controls", () => {
  it("shows server budget, monthly reset, actual model identity, safe failure records and audit actors", async () => {
    setup();
    await screen.findByText("trial@example.com");
    expect(screen.getByText("$98.50")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Platform pool" })).getByText(
        /Resets Dec 1, 2026 \(UTC\)/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Provider: openrouter")).toBeInTheDocument();
    expect(
      screen.getByText("Upstream model: vendor/frontier"),
    ).toBeInTheDocument();
    expect(screen.getByText("usr_operator")).toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveTextContent(
      "Generation not started",
    );
    expect(
      screen.queryByRole("button", { name: /add model/i }),
    ).not.toBeInTheDocument();
  });

  it("requires an explicit save and sends exact microusd with the loaded revision", async () => {
    setup();
    const input = await screen.findByLabelText("Platform monthly budget (USD)");
    const save = screen.getByRole("button", { name: "Save platform pool" });
    expect(save).toBeDisabled();
    fireEvent.change(input, { target: { value: "123.000001" } });
    expect(changeHostingAdmin).not.toHaveBeenCalled();
    fireEvent.click(save);
    await waitFor(() =>
      expect(changeHostingAdmin).toHaveBeenCalledExactlyOnceWith({
        action: "pool",
        revision: 7,
        monthly_microusd: 123_000_001,
      }),
    );
  });

  it("validates unsafe input before making a write", async () => {
    setup();
    const input = await screen.findByLabelText("Platform monthly budget (USD)");
    for (const value of ["-1", "NaN", "1e6", "5.0000001"]) {
      fireEvent.change(input, { target: { value } });
      fireEvent.click(
        screen.getByRole("button", { name: "Save platform pool" }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "nonnegative dollar",
      );
    }
    expect(changeHostingAdmin).not.toHaveBeenCalled();
  });

  it("preserves edits across refresh, then refetches a stale write without retrying it", async () => {
    const { client } = setup();
    const input = await screen.findByLabelText("Platform monthly budget (USD)");
    fireEvent.change(input, { target: { value: "150" } });
    const latest = {
      ...snapshot(),
      revision: 8,
      pool: { ...snapshot().pool, monthly_limit_microusd: 200_000_000 },
    };
    await act(async () =>
      client.setQueryData([...hostingAdminKey(admin.user_id), {}], latest),
    );
    expect(input).toHaveValue("150");
    vi.mocked(readHostingAdmin).mockResolvedValue(latest);
    vi.mocked(changeHostingAdmin).mockRejectedValue(
      new ApiError("hosting_admin_revision_conflict", 409, {}),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save platform pool" }));
    expect(
      await screen.findByText(/Settings changed on the server/),
    ).toBeInTheDocument();
    expect(input).toHaveValue("150");
    expect(changeHostingAdmin).toHaveBeenCalledExactlyOnceWith({
      action: "pool",
      revision: 7,
      monthly_microusd: 150_000_000,
    });
    expect(readHostingAdmin).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole("button", { name: "Save platform pool" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reload this form" }));
    expect(input).toHaveValue("200");
  });

  it("preserves unsaved edits after an API save error or background refresh error", async () => {
    setup();
    const input = await screen.findByLabelText("Default monthly budget (USD)");
    fireEvent.change(input, { target: { value: "7" } });
    vi.mocked(changeHostingAdmin).mockRejectedValue(
      new ApiError("unavailable", 503, {}),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save default allowance" }),
    );
    expect(
      await screen.findByText(/Could not save settings \(HTTP 503\)/),
    ).toBeInTheDocument();
    expect(changeHostingAdmin).toHaveBeenCalledTimes(1);
    vi.mocked(readHostingAdmin).mockRejectedValue(
      new ApiError("unavailable", 503, {}),
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh settings" }));
    expect(
      await screen.findByText(/Could not refresh settings/),
    ).toBeInTheDocument();
    expect(input).toHaveValue("7");
  });

  it("saves a canonical user pause and configured model policy with read-only provider identity", async () => {
    setup();
    fireEvent.click(await screen.findByText("trial@example.com"));
    fireEvent.click(
      screen.getByRole("switch", { name: "Pause free access for usr_trial" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save user usr_trial" }),
    );
    await waitFor(() =>
      expect(changeHostingAdmin).toHaveBeenCalledWith({
        action: "user",
        revision: 7,
        target_id: "usr_trial",
        access_paused: true,
      }),
    );
    fireEvent.click(
      screen.getByText("free-frontier", { selector: "summary span" }),
    );
    fireEvent.change(screen.getByLabelText("Safety policy for free-frontier"), {
      target: { value: "off" },
    });
    expect(
      screen.getByText("Requests to this model skip the OpenAI safety check."),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Save model free-frontier" }),
    );
    await waitFor(() =>
      expect(changeHostingAdmin).toHaveBeenCalledWith({
        action: "model",
        revision: 7,
        target_id: "free-frontier",
        expected_model_base: "base-v1",
        enabled: true,
        moderation: "off",
        max_output_tokens: 10_000,
        input_microusd_per_million: 3_000_000,
        output_microusd_per_million: 15_000_000,
      }),
    );
  });

  it("filters both lists, paginates independently, and never duplicates a request row", async () => {
    const first = snapshot();
    first.users_next = "usr_next";
    first.requests_next = "req_next";
    first.requests.push(first.requests[0]);
    first.requests.push({
      ...first.requests[0],
      id: "env_other:request_1",
      environment_id: "env_other",
      user_id: "usr_other",
    });
    vi.mocked(readHostingAdmin).mockResolvedValue(first);
    setup();
    await screen.findByText("trial@example.com");
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      3,
    );
    fireEvent.click(screen.getByRole("button", { name: "Next users" }));
    await waitFor(() =>
      expect(readHostingAdmin).toHaveBeenLastCalledWith(
        { users_after: "usr_next" },
        expect.any(AbortSignal),
      ),
    );
    await screen.findByText("trial@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Next requests" }));
    await waitFor(() =>
      expect(readHostingAdmin).toHaveBeenLastCalledWith(
        { users_after: "usr_next", requests_before: "req_next" },
        expect.any(AbortSignal),
      ),
    );
    await screen.findByText("trial@example.com");
    fireEvent.change(screen.getByLabelText("Email or user ID"), {
      target: { value: "trial@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Request status"), {
      target: { value: "moderation_blocked" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() =>
      expect(readHostingAdmin).toHaveBeenLastCalledWith(
        {
          user_query: "trial@example.com",
          request_status: "moderation_blocked",
        },
        expect.any(AbortSignal),
      ),
    );
    expect(changeHostingAdmin).not.toHaveBeenCalled();
  });

  it("keeps a successfully saved value when the following refresh fails", async () => {
    setup();
    const input = await screen.findByLabelText("Platform monthly budget (USD)");
    fireEvent.change(input, { target: { value: "250" } });
    vi.mocked(readHostingAdmin).mockRejectedValue(
      new ApiError("unavailable", 503, {}),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save platform pool" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(input).toHaveValue("250");
    expect(screen.getByText(/Could not refresh settings/)).toBeInTheDocument();
  });

  it("shows a changed base policy and binds model saves to the originally displayed base", async () => {
    const deployed = snapshot();
    deployed.model_warnings = { "free-frontier": "base_policy_changed" };
    deployed.models[0].enabled = false;
    vi.mocked(readHostingAdmin).mockResolvedValue(deployed);
    const { client } = setup();
    expect(
      await screen.findByText(/Server model configuration changed/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByText("free-frontier", { selector: "summary span" }),
    );
    fireEvent.click(
      screen.getByRole("switch", { name: "Enable free-frontier" }),
    );
    const newer = structuredClone(deployed);
    newer.models[0].moderation = "off";
    newer.model_bases["free-frontier"] = "base-v2";
    await act(async () =>
      client.setQueryData([...hostingAdminKey(admin.user_id), {}], newer),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save model free-frontier" }),
      ).toBeDisabled(),
    );
    expect(screen.getByText(/Server values changed/)).toBeInTheDocument();
    expect(
      screen.getByLabelText("Safety policy for free-frontier"),
    ).toHaveValue("openai");
    expect(changeHostingAdmin).not.toHaveBeenCalled();
  });
});

it("keeps administration available with hosting disabled and a zero pool, without making generation requests", async () => {
  const closed = snapshot();
  closed.enabled = false;
  closed.pool = {
    ...closed.pool,
    monthly_limit_microusd: 0,
    remaining_microusd: 0,
    available: false,
  };
  closed.models = closed.models.map((model) => ({ ...model, enabled: false }));
  vi.mocked(readHostingAdmin).mockResolvedValue(closed);
  setup();
  expect(await screen.findByText("Hosting disabled")).toBeInTheDocument();
  expect(screen.getByText("Zero budget")).toBeInTheDocument();
  expect(screen.getByLabelText("Platform monthly budget (USD)")).toHaveValue(
    "0",
  );
  expect(changeHostingAdmin).not.toHaveBeenCalled();
});

it("translates administration controls while preserving provider and model identities", async () => {
  useLocaleStore.setState({ locale: "zh-CN" });
  setup();
  expect(
    await screen.findByRole("heading", { name: "模型网关" }),
  ).toBeInTheDocument();
  expect(await screen.findByLabelText("平台月度预算（美元）")).toHaveValue(
    "100",
  );
  expect(screen.getByRole("button", { name: "保存平台总池" })).toBeDisabled();
  fireEvent.click(
    screen.getByText("free-frontier", { selector: "summary span" }),
  );
  expect(screen.getByText("供应商：openrouter")).toBeInTheDocument();
  expect(screen.getByText("上游模型：vendor/frontier")).toBeInTheDocument();
  expect(screen.getByLabelText("free-frontier 安全策略")).toHaveValue("openai");
  expect(changeHostingAdmin).not.toHaveBeenCalled();
});

it.each([
  {
    name: "funded and enabled",
    enabled: true,
    available: true,
    limit: 100_000_000,
    spent: 0,
    reserved: 0,
    remaining: 100_000_000,
    status: "Funded",
    notice: false,
  },
  {
    name: "funded but unavailable",
    enabled: true,
    available: false,
    limit: 100_000_000,
    spent: 0,
    reserved: 0,
    remaining: 100_000_000,
    status: "Funded",
    notice: true,
  },
  {
    name: "zero budget",
    enabled: true,
    available: false,
    limit: 0,
    spent: 0,
    reserved: 0,
    remaining: 0,
    status: "Zero budget",
    notice: false,
  },
  {
    name: "spent budget",
    enabled: true,
    available: false,
    limit: 100_000_000,
    spent: 100_000_000,
    reserved: 0,
    remaining: 0,
    status: "Exhausted",
    notice: false,
  },
  {
    name: "fully reserved budget",
    enabled: true,
    available: false,
    limit: 100_000_000,
    spent: 0,
    reserved: 100_000_000,
    remaining: 0,
    status: "Exhausted",
    notice: false,
  },
])(
  "shows the monetary pool status for $name without changing access or credit",
  async (example) => {
    const current = snapshot();
    current.enabled = example.enabled;
    current.pool = {
      ...current.pool,
      available: example.available,
      monthly_limit_microusd: example.limit,
      spent_microusd: example.spent,
      reserved_microusd: example.reserved,
      remaining_microusd: example.remaining,
    };
    vi.mocked(readHostingAdmin).mockResolvedValue(current);
    setup();
    await screen.findByLabelText("Platform monthly budget (USD)");
    const pool = within(screen.getByRole("region", { name: "Platform pool" }));
    expect(pool.getByText(example.status)).toBeInTheDocument();
    const notice = pool.queryByText(
      "Free model requests are currently unavailable despite the remaining budget.",
    );
    if (example.notice) expect(notice).toBeInTheDocument();
    else expect(notice).not.toBeInTheDocument();
    expect(changeHostingAdmin).not.toHaveBeenCalled();
  },
);

it("shows the funded but disabled $100 pool truthfully in Chinese", async () => {
  useLocaleStore.setState({ locale: "zh-CN" });
  const current = snapshot();
  current.enabled = false;
  current.pool = {
    ...current.pool,
    available: false,
    monthly_limit_microusd: 100_000_000,
    spent_microusd: 0,
    reserved_microusd: 0,
    remaining_microusd: 100_000_000,
  };
  current.models = current.models.map((model) => ({
    ...model,
    enabled: false,
  }));
  vi.mocked(readHostingAdmin).mockResolvedValue(current);
  setup();
  expect(await screen.findByLabelText("平台月度预算（美元）")).toHaveValue(
    "100",
  );
  const pool = within(screen.getByRole("region", { name: "平台总池" }));
  expect(pool.getByText("有余额")).toBeInTheDocument();
  expect(pool.queryByText("已耗尽")).not.toBeInTheDocument();
  expect(
    pool.getByText("免费模型请求尚未启用。调整预算不会启用托管。"),
  ).toBeInTheDocument();
  expect(screen.getByText("托管已停用")).toBeInTheDocument();
  expect(changeHostingAdmin).not.toHaveBeenCalled();
});
