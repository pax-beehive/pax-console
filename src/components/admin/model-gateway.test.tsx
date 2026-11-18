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
import {
  readModelCatalog,
  modelCatalogKey,
  type ModelCatalog,
} from "@/features/api/model-catalog";
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

vi.mock("@/features/api/model-catalog", async (original) => ({
  ...(await original<typeof import("@/features/api/model-catalog")>()),
  readModelCatalog: vi.fn(),
}));

function catalog(): ModelCatalog {
  return {
    source: "openrouter",
    fetched_at: "2026-11-16T00:00:00Z",
    models: [
      {
        id: "vendor/catalog-one",
        name: "Catalog One",
        context_length: 200000,
        max_output_tokens: 4096,
        input_microusd_per_million: 3_000_001,
        output_microusd_per_million: 15_000_001,
        pricing_is_conservative: true,
      },
      {
        id: "vendor/catalog-two",
        name: "Catalog Two",
        context_length: 100000,
        max_output_tokens: 2048,
        input_microusd_per_million: 0,
        output_microusd_per_million: 0,
      },
      {
        id: "vendor/frontier",
        name: "Already Configured",
        context_length: 100000,
        max_output_tokens: 2048,
        input_microusd_per_million: 3_000_000,
        output_microusd_per_million: 15_000_000,
      },
    ],
  };
}

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
  vi.mocked(readModelCatalog).mockReset().mockResolvedValue(catalog());
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
      screen.getByText("Remaining $3.50 · 198,000 tokens"),
    ).toBeInTheDocument();
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
      screen.getByRole("button", { name: /add model/i }),
    ).toBeInTheDocument();
  });

  it("shows unlimited monthly tokens without hiding money or token usage", async () => {
    const unlimited = snapshot();
    unlimited.defaults.monthly_tokens = 0;
    unlimited.users[0].monthly_tokens = 0;
    unlimited.users[0].quota.granted_tokens = 0;
    unlimited.users[0].quota.remaining_tokens = 0;
    vi.mocked(readHostingAdmin).mockResolvedValue(unlimited);
    setup();
    await screen.findByText("trial@example.com");
    expect(
      screen.getByText("Remaining $3.50 · Unlimited tokens"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Tokens: 1,000 spent · 1,000 reserved"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Default monthly tokens")).toHaveValue("0");
    expect(screen.getByLabelText("Monthly tokens for usr_trial")).toHaveValue(
      "0",
    );
    expect(
      screen.queryByText("Remaining $3.50 · 0 tokens"),
    ).not.toBeInTheDocument();
  });

  it.each(["defaults", "user"])(
    "saves zero as the unlimited %s token cap without increasing money",
    async (target) => {
      setup();
      await screen.findByText("trial@example.com");
      const label =
        target === "defaults"
          ? "Default monthly tokens"
          : "Monthly tokens for usr_trial";
      const button =
        target === "defaults"
          ? "Save default allowance"
          : "Save user usr_trial";
      if (target === "user")
        fireEvent.click(screen.getByText("trial@example.com"));
      fireEvent.change(screen.getByLabelText(label), {
        target: { value: "0" },
      });
      fireEvent.click(screen.getByRole("button", { name: button }));
      await waitFor(() =>
        expect(changeHostingAdmin).toHaveBeenCalledExactlyOnceWith({
          revision: 7,
          action: target,
          monthly_tokens: 0,
          ...(target === "defaults"
            ? { monthly_microusd: 5_000_000 }
            : { target_id: "usr_trial" }),
        }),
      );
    },
  );

  it("keeps a zero dollar balance visible when monthly tokens are unlimited", async () => {
    const exhausted = snapshot();
    exhausted.pool.monthly_limit_microusd = 0;
    exhausted.pool.remaining_microusd = 0;
    exhausted.pool.available = false;
    exhausted.users[0].quota.granted_tokens = 0;
    exhausted.users[0].quota.remaining_tokens = 0;
    exhausted.users[0].quota.remaining_microusd = 0;
    vi.mocked(readHostingAdmin).mockResolvedValue(exhausted);
    setup();
    expect(await screen.findByText("Zero budget")).toBeInTheDocument();
    expect(
      screen.getByText("Remaining $0.00 · Unlimited tokens"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Funded")).not.toBeInTheDocument();
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

it("translates unlimited token summaries and explains both monthly token editors", async () => {
  const unlimited = snapshot();
  unlimited.users[0].quota.granted_tokens = 0;
  unlimited.users[0].quota.remaining_tokens = 0;
  vi.mocked(readHostingAdmin).mockResolvedValue(unlimited);
  useLocaleStore.setState({ locale: "zh-CN" });
  setup();
  expect(
    await screen.findByText("剩余 $3.50 · token 不限"),
  ).toBeInTheDocument();
  expect(
    screen.getAllByText("月度 token 设为 0 表示不限 token，金额预算仍然生效。"),
  ).toHaveLength(2);
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

async function openNewModel(alias = "new-trial-model") {
  await screen.findByLabelText("Platform monthly budget (USD)");
  fireEvent.click(screen.getByRole("button", { name: "Add model" }));
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Select Catalog One (vendor/catalog-one)",
    }),
  );
  fireEvent.change(screen.getByLabelText("Model alias"), {
    target: { value: alias },
  });
}

describe("model catalog import and creation", () => {
  it("searches the actual catalog, prefills exact conservative rates and output cap, and reloads the server-created disabled model", async () => {
    let current = snapshot();
    vi.mocked(readHostingAdmin).mockImplementation(async () => current);
    vi.mocked(changeHostingAdmin).mockImplementation(async (change) => {
      if (change.action !== "model_create")
        throw new Error("Expected model creation");
      current = {
        ...current,
        revision: 8,
        models: [
          ...current.models,
          {
            id: change.target_id,
            provider: change.provider,
            upstream_model: change.upstream_model,
            moderation: change.moderation,
            max_output_tokens: change.max_output_tokens,
            input_microusd_per_million: change.input_microusd_per_million,
            output_microusd_per_million: change.output_microusd_per_million,
            enabled: false,
            policy_version: "admin-8",
          },
        ],
        model_bases: { ...current.model_bases, [change.target_id]: "new-base" },
      };
      return current;
    });
    setup();
    await openNewModel();
    expect(
      screen.queryByRole("button", { name: /Select Already Configured/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Upstream model ID")).toBeDisabled();
    expect(screen.getByLabelText("Upstream model ID")).toHaveValue(
      "vendor/catalog-one",
    );
    expect(
      screen.getByLabelText("Input USD / million for the new model"),
    ).toHaveValue("3.000001");
    expect(
      screen.getByLabelText("Output USD / million for the new model"),
    ).toHaveValue("15.000001");
    expect(
      screen.getByLabelText("Max output tokens for the new model"),
    ).toHaveValue("4096");
    expect(
      screen.getByText("Conservative rate includes conditional token charges."),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search OpenRouter models"), {
      target: { value: "catalog-one" },
    });
    expect(
      screen.queryByRole("button", { name: /Select Catalog Two/ }),
    ).not.toBeInTheDocument();
    expect(changeHostingAdmin).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Create model" }));
    expect(
      await screen.findByText(
        "Model saved and disabled. Connect its provider before enabling it.",
      ),
    ).toBeInTheDocument();
    expect(changeHostingAdmin).toHaveBeenCalledExactlyOnceWith({
      revision: 7,
      action: "model_create",
      target_id: "new-trial-model",
      provider: "openrouter",
      upstream_model: "vendor/catalog-one",
      moderation: "openai",
      max_output_tokens: 4096,
      input_microusd_per_million: 3_000_001,
      output_microusd_per_million: 15_000_001,
      enabled: false,
    });
    cleanup();
    setup();
    expect(
      await screen.findByText("new-trial-model", { selector: "summary span" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Disabled")).toHaveLength(1);
  });

  it("shows catalog failure and empty retry results without inventing models or sending writes", async () => {
    vi.mocked(readModelCatalog)
      .mockRejectedValueOnce(new ApiError("Unavailable", 503, undefined))
      .mockResolvedValue({ ...catalog(), models: [] });
    setup();
    await screen.findByLabelText("Platform monthly budget (USD)");
    expect(readModelCatalog).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Add model" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load the OpenRouter catalog",
    );
    expect(
      screen.queryByRole("button", { name: /Select Catalog/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Upstream model ID")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Retry catalog" }));
    expect(
      await screen.findByText(
        "OpenRouter returned no compatible priced text models.",
      ),
    ).toBeInTheDocument();
    expect(changeHostingAdmin).not.toHaveBeenCalled();
    expect(readModelCatalog).toHaveBeenCalledTimes(2);
  });

  it("preserves duplicate409 drafts and allows an explicit corrected alias without automatic retry", async () => {
    vi.mocked(changeHostingAdmin)
      .mockRejectedValueOnce(new ApiError("hosting_model_conflict", 409, {}))
      .mockResolvedValue({ ...snapshot(), revision: 8 });
    setup();
    await openNewModel("free-frontier");
    fireEvent.click(screen.getByRole("button", { name: "Create model" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This alias or provider/model is already configured",
    );
    expect(screen.getByLabelText("Model alias")).toHaveValue("free-frontier");
    expect(
      screen.getByLabelText("Input USD / million for the new model"),
    ).toHaveValue("3.000001");
    expect(changeHostingAdmin).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Model alias"), {
      target: { value: "another-alias" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create model" }));
    await screen.findByText(
      "Model saved and disabled. Connect its provider before enabling it.",
    );
    expect(changeHostingAdmin).toHaveBeenLastCalledWith(
      expect.objectContaining({ target_id: "another-alias", enabled: false }),
    );
    expect(changeHostingAdmin).toHaveBeenCalledTimes(2);
  });

  it("requires explicit revision reload after stale409 while preserving the catalog selection and entered alias", async () => {
    setup();
    await openNewModel();
    vi.mocked(readHostingAdmin).mockResolvedValue({
      ...snapshot(),
      revision: 8,
    });
    vi.mocked(changeHostingAdmin)
      .mockRejectedValueOnce(
        new ApiError("hosting_admin_revision_conflict", 409, {}),
      )
      .mockResolvedValue({ ...snapshot(), revision: 9 });
    fireEvent.click(screen.getByRole("button", { name: "Create model" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Settings changed on the server",
    );
    expect(changeHostingAdmin).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Create model" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reload this form" }));
    expect(screen.getByLabelText("Model alias")).toHaveValue("new-trial-model");
    expect(screen.getByLabelText("Upstream model ID")).toHaveValue(
      "vendor/catalog-one",
    );
    fireEvent.click(screen.getByRole("button", { name: "Create model" }));
    await screen.findByText(
      "Model saved and disabled. Connect its provider before enabling it.",
    );
    expect(changeHostingAdmin).toHaveBeenLastCalledWith(
      expect.objectContaining({
        revision: 8,
        target_id: "new-trial-model",
        enabled: false,
      }),
    );
    expect(changeHostingAdmin).toHaveBeenCalledTimes(2);
  });

  it("loses the catalog and creation draft when the server denies catalog access", async () => {
    vi.mocked(readModelCatalog).mockRejectedValue(new AuthError());
    const { client } = setup();
    await screen.findByLabelText("Platform monthly budget (USD)");
    fireEvent.click(screen.getByRole("button", { name: "Add model" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Access denied");
    expect(screen.queryByLabelText("Model alias")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        client.getQueriesData({ queryKey: modelCatalogKey(admin.user_id) }),
      ).toEqual([]),
    );
    expect(
      client.getQueriesData({ queryKey: hostingAdminKey(admin.user_id) }),
    ).toEqual([]);
    expect(changeHostingAdmin).not.toHaveBeenCalled();
  });

  it.each(["role", "preview"])(
    "removes the open creation draft and catalog after losing %s access",
    async (mode) => {
      const { client, rerender } = setup();
      await openNewModel();
      if (mode === "role") rerender(ordinary);
      else act(() => useConsoleStore.setState({ previewAsUser: true }));
      expect(screen.getByRole("alert")).toHaveTextContent("Access denied");
      expect(screen.queryByLabelText("Model alias")).not.toBeInTheDocument();
      await waitFor(() =>
        expect(
          client.getQueriesData({ queryKey: modelCatalogKey(admin.user_id) }),
        ).toEqual([]),
      );
      expect(changeHostingAdmin).not.toHaveBeenCalled();
    },
  );

  it.each(["openai", "anthropic"])(
    "supports secondary manual %s profile entry but always creates it disabled",
    async (provider) => {
      setup();
      await openNewModel();
      fireEvent.change(screen.getByLabelText("Provider"), {
        target: { value: provider },
      });
      expect(screen.getByLabelText("Upstream model ID")).toHaveValue("");
      fireEvent.change(screen.getByLabelText("Model alias"), {
        target: { value: "manual-model" },
      });
      fireEvent.change(screen.getByLabelText("Upstream model ID"), {
        target: { value: "provider-model-id" },
      });
      fireEvent.change(
        screen.getByLabelText("Input USD / million for the new model"),
        { target: { value: "0" } },
      );
      fireEvent.change(
        screen.getByLabelText("Output USD / million for the new model"),
        { target: { value: "0" } },
      );
      fireEvent.click(screen.getByRole("button", { name: "Create model" }));
      await screen.findByText(
        "Model saved and disabled. Connect its provider before enabling it.",
      );
      expect(changeHostingAdmin).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          provider,
          upstream_model: "provider-model-id",
          enabled: false,
        }),
      );
    },
  );

  it.each([
    ["Upstream model ID", "https://example.test/model"],
    ["Upstream model ID", "vendor/../model"],
    ["Max output tokens for the new model", "8193"],
    ["Input USD / million for the new model", "1000000.000001"],
  ])("rejects unsafe %s before submission", async (label, value) => {
    setup();
    await openNewModel();
    fireEvent.change(screen.getByLabelText("Provider"), {
      target: { value: "openai" },
    });
    fireEvent.change(screen.getByLabelText("Upstream model ID"), {
      target: { value: "valid-model" },
    });
    fireEvent.change(
      screen.getByLabelText("Input USD / million for the new model"),
      { target: { value: "3" } },
    );
    fireEvent.change(
      screen.getByLabelText("Output USD / million for the new model"),
      { target: { value: "15" } },
    );
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Create model" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(changeHostingAdmin).not.toHaveBeenCalled();
  });
});

it("reloads a newer revision after an identity collision without discarding the corrected creation draft", async () => {
  setup();
  await openNewModel("new-trial-model");
  vi.mocked(readHostingAdmin).mockResolvedValue({ ...snapshot(), revision: 8 });
  vi.mocked(changeHostingAdmin)
    .mockRejectedValueOnce(new ApiError("hosting_model_conflict", 409, {}))
    .mockResolvedValue({ ...snapshot(), revision: 9 });
  fireEvent.click(screen.getByRole("button", { name: "Create model" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This alias or provider/model is already configured",
  );
  fireEvent.change(screen.getByLabelText("Model alias"), {
    target: { value: "corrected-alias" },
  });
  expect(screen.getByRole("button", { name: "Create model" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Reload this form" }));
  expect(screen.getByLabelText("Model alias")).toHaveValue("corrected-alias");
  expect(
    screen.getByLabelText("Input USD / million for the new model"),
  ).toHaveValue("3.000001");
  fireEvent.click(screen.getByRole("button", { name: "Create model" }));
  await screen.findByText(
    "Model saved and disabled. Connect its provider before enabling it.",
  );
  expect(changeHostingAdmin).toHaveBeenLastCalledWith(
    expect.objectContaining({
      revision: 8,
      target_id: "corrected-alias",
      enabled: false,
    }),
  );
  expect(changeHostingAdmin).toHaveBeenCalledTimes(2);
});
