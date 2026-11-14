// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { User } from "@/features/api/types";
import { useLocaleStore } from "@/features/i18n/locale-store";
import type {
  ConfigEntry,
  ConfigSnapshot,
  ConfigAuditItem,
} from "@/features/runtime-config";
import { useConfigAdminStore } from "@/stores/config-admin-store";
import { useConsoleStore } from "@/stores/console-store";
import { ConfigDashboard } from "./config-dashboard";
import { ConfigAccess } from "./config-page";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  usePathname: () => "/admin/config",
}));
vi.mock("@/components/shell/console-layout", () => ({
  ConsoleLayout: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

const baseEntry: ConfigEntry = {
  key: "search.url",
  kind: "setting",
  group: "search",
  label: "Search URL",
  description: "Search service URL",
  type: "url",
  options: null,
  secret: false,
  value: "https://us-search.example.test",
  display: "https://us-search.example.test",
  has_value: true,
  source: "db",
  env_var: "SEARCH_URL",
  default_display: "http://localhost:9200",
  apply: "live",
  pending_restart: false,
  testable: true,
  version: 3,
  updated_at: "2026-11-13T12:00:00Z",
  updated_by: "admin@example.test",
};
const auditItem: ConfigAuditItem = {
  id: 101,
  key: "search.url",
  action: "set",
  old_display: "https://old-search.example.test",
  new_display: "https://us-search.example.test",
  version: 2,
  actor: "admin@example.test",
  reason: "Initial rollout",
  created_at: "2026-11-13T12:00:00Z",
  revertible: true,
};
function snapshot(region: "us" | "hk"): ConfigSnapshot {
  return {
    region,
    revision: 42,
    vault_configured: true,
    health: {
      last_refresh_at: "2026-11-13T12:00:00Z",
      refresh_failures: 0,
      degraded: false,
    },
    entries: [
      {
        ...baseEntry,
        key: "feature.secretary",
        kind: "feature",
        group: "features",
        label: "Secretary",
        description: "Secretary feature",
        type: "feature",
        value: { stage: "admin", beta_emails: [] },
        display: "admin",
        testable: false,
        env_var: "",
      },
      {
        ...baseEntry,
        value: `https://${region}-search.example.test`,
        display: `https://${region}-search.example.test`,
        version: region === "us" ? 3 : 7,
      },
      {
        ...baseEntry,
        key: "search.api_key",
        label: "Search API key",
        description: "Search credential",
        type: "string",
        value: null,
        display: "sk-…a3f2",
        secret: true,
        version: 2,
        env_var: "SEARCH_API_KEY",
      },
    ],
  };
}
type RequestRecord = {
  url: URL;
  method: string;
  body: Record<string, unknown> | undefined;
};
let clients: QueryClient[] = [];
let snapshots: Record<"us" | "hk", ConfigSnapshot>;
let requests: RequestRecord[];
let intercept:
  | ((
      request: RequestRecord,
    ) => Response | undefined | Promise<Response | undefined>)
  | undefined;

function json(data: unknown, status = 200) {
  return new Response(
    JSON.stringify({
      code: status,
      data,
      message: status >= 400 ? "Request failed" : "ok",
    }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}
function renderDashboard() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  clients.push(client);
  const view = render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <ConfigDashboard userId="admin" />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { ...view, client };
}
const writes = () => requests.filter((request) => request.method !== "GET");

async function openSetting(label = "Search URL") {
  await screen.findByRole("button", { name: "Edit Secretary" });
  fireEvent.click(screen.getByRole("tab", { name: "Service settings" }));
  fireEvent.click(screen.getByRole("button", { name: `Edit ${label}` }));
  return screen.getByRole("dialog", { name: `Edit ${label}` });
}
function changeText(dialog: HTMLElement, label: string, value: string) {
  fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  useLocaleStore.setState({ locale: "en" });
  useConfigAdminStore.setState({ region: "us", tab: "features" });
  useConsoleStore.setState({ previewAsUser: false });
  navigation.replace.mockReset();
  snapshots = { us: snapshot("us"), hk: snapshot("hk") };
  requests = [];
  intercept = undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input, "https://console.example.test");
      const request: RequestRecord = {
        url,
        method: init?.method ?? "GET",
        body:
          typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      };
      requests.push(request);
      const overridden = await intercept?.(request);
      if (overridden) return overridden;
      const region = url.searchParams.get("region") as "us" | "hk";
      const path = decodeURIComponent(url.pathname);
      if (request.method === "GET" && path.endsWith("/audit"))
        return json({ items: [auditItem], next_cursor: null });
      if (request.method === "GET" && path.endsWith("/config"))
        return json(snapshots[region]);
      if (path.endsWith("/test"))
        return json({ ok: true, latency_ms: 180, message: "Connected" });
      const key = path.endsWith("/revert")
        ? auditItem.key
        : path.split("/").at(-1);
      const entry = snapshots[region].entries.find((item) => item.key === key)!;
      const updated = { ...entry, version: entry.version + 1 };
      if (request.method === "PUT") {
        updated.value = updated.secret
          ? null
          : (request.body?.value as ConfigEntry["value"]);
        updated.display = updated.secret
          ? "sk-…new1"
          : typeof updated.value === "string"
            ? updated.value
            : JSON.stringify(updated.value);
      }
      if (path.endsWith("/revert")) {
        updated.value = auditItem.old_display;
        updated.display = auditItem.old_display;
      }
      if (request.method === "DELETE") updated.source = "env";
      snapshots[region] = {
        ...snapshots[region],
        entries: snapshots[region].entries.map((item) =>
          item.key === key ? updated : item,
        ),
      };
      return json(updated);
    }),
  );
});
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients = [];
  vi.unstubAllGlobals();
});

describe("runtime configuration administration", () => {
  it.each([false, true])(
    "Given an ordinary user or admin preview (%s), redirects home before requesting protected data",
    (preview) => {
      useConsoleStore.setState({ previewAsUser: preview });
      render(
        <ConfigAccess user={{ user_id: "admin", is_admin: preview } as User} />,
      );
      expect(navigation.replace).toHaveBeenCalledWith("/");
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("Given keyboard tab navigation, moves focus and selection with arrows, Home, and End", async () => {
    renderDashboard();
    await screen.findByRole("button", { name: "Edit Secretary" });
    const features = screen.getByRole("tab", { name: "Feature flags" });
    const settings = screen.getByRole("tab", { name: "Service settings" });
    const history = screen.getByRole("tab", { name: "Change history" });
    expect(features).toHaveAttribute("tabindex", "0");
    expect(settings).toHaveAttribute("tabindex", "-1");
    act(() => features.focus());
    fireEvent.keyDown(features, { key: "ArrowRight" });
    expect(settings).toHaveFocus();
    expect(settings).toHaveAttribute("aria-selected", "true");
    expect(settings).toHaveAttribute("tabindex", "0");
    expect(features).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      settings.id,
    );

    fireEvent.keyDown(settings, { key: "End" });
    expect(history).toHaveFocus();
    expect(history).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(history, { key: "ArrowRight" });
    expect(features).toHaveFocus();
    fireEvent.keyDown(features, { key: "ArrowLeft" });
    expect(history).toHaveFocus();
    fireEvent.keyDown(history, { key: "Home" });
    expect(features).toHaveFocus();
    expect(features).toHaveAttribute("aria-selected", "true");
  });

  it("Given the Chinese locale, translates the main page, drawer, and impact confirmation", async () => {
    useLocaleStore.setState({ locale: "zh-CN" });
    renderDashboard();
    expect(
      screen.getByRole("heading", { name: "运行时配置" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("区域")).toHaveValue("us");
    for (const label of ["功能开关", "服务配置", "修改记录"])
      expect(screen.getByRole("tab", { name: label })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "编辑秘书" }));
    const dialog = screen.getByRole("dialog", { name: "编辑秘书" });
    expect(within(dialog).getByLabelText("开放阶段")).toHaveDisplayValue(
      "仅管理员",
    );
    expect(
      within(dialog).getByRole("checkbox", { name: "同时应用到 HK" }),
    ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("开放阶段"), {
      target: { value: "ga" },
    });
    changeText(dialog, "修改原因", "向所有用户开放");
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
    const confirmation = screen.getByRole("dialog", {
      name: "确认功能开放范围变更",
    });
    expect(confirmation).toHaveTextContent(
      "US 的所有登录用户都将可以使用秘书。",
    );
    expect(
      within(confirmation).getByRole("button", { name: "确认" }),
    ).toBeInTheDocument();
    fireEvent.click(within(confirmation).getByRole("button", { name: "取消" }));
    expect(writes()).toHaveLength(0);
  });

  it("Given a regional selection, reads that region through the same-origin proxy", async () => {
    renderDashboard();
    await screen.findByRole("button", { name: "Edit Secretary" });
    fireEvent.change(screen.getByLabelText("Region"), {
      target: { value: "hk" },
    });
    await waitFor(() =>
      expect(
        requests.some(
          ({ url }) =>
            url.pathname.endsWith("/config") &&
            url.searchParams.get("region") === "hk",
        ),
      ).toBe(true),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Service settings" }));
    expect(
      await screen.findByText("https://hk-search.example.test"),
    ).toBeInTheDocument();
    expect(
      requests.every(({ url }) => url.pathname.startsWith("/api/pax/")),
    ).toBe(true);
  });

  it("Given a connection test, sends the group without writing configuration", async () => {
    renderDashboard();
    await screen.findByRole("button", { name: "Edit Secretary" });
    fireEvent.click(screen.getByRole("tab", { name: "Service settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(
      await screen.findByText("Connection succeeded (180 ms)"),
    ).toBeInTheDocument();
    expect(writes()).toHaveLength(1);
    expect(writes()[0]).toMatchObject({
      method: "POST",
      body: { group: "search", overrides: {} },
    });
    expect(writes()[0].url.pathname).toBe("/api/pax/api/v1/admin/config/test");
  });

  it("Given a successful US test and a warm HK snapshot, does not display the US result in HK", async () => {
    const { client } = renderDashboard();
    client.setQueryData(["runtime-config", "admin", "hk"], snapshots.hk);
    await screen.findByRole("button", { name: "Edit Secretary" });
    fireEvent.click(screen.getByRole("tab", { name: "Service settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(
      await screen.findByText("Connection succeeded (180 ms)"),
    ).toBeInTheDocument();
    expect(writes()[0].url.searchParams.get("region")).toBe("us");

    fireEvent.change(screen.getByLabelText("Region"), {
      target: { value: "hk" },
    });
    expect(
      screen.getByText("https://hk-search.example.test"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Connection succeeded (180 ms)"),
    ).not.toBeInTheDocument();
    expect(writes()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(
      await screen.findByText("Connection succeeded (180 ms)"),
    ).toBeInTheDocument();
    expect(writes()[1].url.searchParams.get("region")).toBe("hk");
  });

  it("Given a draft without a reason, blocks saving until a meaningful reason is supplied", async () => {
    renderDashboard();
    const dialog = await openSetting();
    changeText(dialog, "Value", "https://new-search.example.test");
    const save = within(dialog).getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    changeText(dialog, "Reason", "   ");
    expect(save).toBeDisabled();
    expect(writes()).toHaveLength(0);
    changeText(dialog, "Reason", "  Search rollout  ");
    fireEvent.click(save);
    expect(await within(dialog).findByText("Saved · v4")).toBeInTheDocument();
    expect(writes()).toHaveLength(1);
    expect(writes()[0]).toMatchObject({
      method: "PUT",
      body: {
        value: "https://new-search.example.test",
        expected_version: 3,
        reason: "Search rollout",
      },
    });
  });

  it("Given a 409 conflict, preserves the draft and requires review before retrying against the refreshed version", async () => {
    intercept = (request) => {
      if (request.method !== "PUT" || writes().length > 1) return;
      snapshots.us.entries = snapshots.us.entries.map((entry) =>
        entry.key === "search.url"
          ? {
              ...entry,
              version: 4,
              value: "https://teammate.example.test",
              display: "https://teammate.example.test",
            }
          : entry,
      );
      return json({ error: "version_conflict", version: 4 }, 409);
    };
    renderDashboard();
    const dialog = await openSetting();
    changeText(dialog, "Value", "https://my-draft.example.test");
    changeText(dialog, "Reason", "My rollout");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await within(dialog).findByText("Conflict · not saved"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(within(dialog).getByText(/Current value:/)).toHaveTextContent(
        "https://teammate.example.test",
      ),
    );
    expect(within(dialog).getByLabelText("Value")).toHaveValue(
      "https://my-draft.example.test",
    );
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(writes()).toHaveLength(1);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Review current version" }),
    );
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "Save" }),
      ).toBeEnabled(),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Saved · v5")).toBeInTheDocument();
    expect(writes()[1].body).toMatchObject({
      expected_version: 4,
      value: "https://my-draft.example.test",
    });
  });

  it("Given the second region fails, keeps the first success and shows independent regional results", async () => {
    let finishFirst!: (response: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => {
      finishFirst = resolve;
    });
    intercept = (request) => {
      if (request.method !== "PUT") return;
      if (request.url.searchParams.get("region") === "hk") return json({}, 503);
      return firstResponse;
    };
    renderDashboard();
    const dialog = await openSetting();
    changeText(dialog, "Value", "https://both.example.test");
    changeText(dialog, "Reason", "Both regions rollout");
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: "Also apply to HK" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].url.searchParams.get("region")).toBe("us");
    const firstUpdated = {
      ...snapshots.us.entries.find(({ key }) => key === "search.url")!,
      value: "https://both.example.test",
      display: "https://both.example.test",
      version: 4,
    };
    snapshots.us.entries = snapshots.us.entries.map((entry) =>
      entry.key === firstUpdated.key ? firstUpdated : entry,
    );
    finishFirst(json(firstUpdated));
    const results = await within(dialog).findByRole("region", {
      name: "Regional results",
    });
    await within(results).findByText("Failed · not saved");
    expect(results).toHaveTextContent("USSaved · v4");
    expect(results).toHaveTextContent("HKFailed · not saved");
    expect(
      writes().map(({ url, body }) => [
        url.searchParams.get("region"),
        body?.expected_version,
      ]),
    ).toEqual([
      ["us", 3],
      ["hk", 7],
    ]);
    expect(
      snapshots.us.entries.find(({ key }) => key === "search.url")?.value,
    ).toBe("https://both.example.test");
    expect(
      snapshots.hk.entries.find(({ key }) => key === "search.url")?.value,
    ).toBe("https://hk-search.example.test");
  });

  it("Given US succeeds and HK conflicts, reviews and retries only HK with its competing version", async () => {
    intercept = (request) => {
      if (
        request.method !== "PUT" ||
        request.url.searchParams.get("region") !== "hk"
      )
        return;
      const hkWrites = writes().filter(
        ({ url }) => url.searchParams.get("region") === "hk",
      );
      if (hkWrites.length > 1) return;
      snapshots.hk.entries = snapshots.hk.entries.map((entry) =>
        entry.key === "search.url"
          ? {
              ...entry,
              version: 9,
              value: "https://competing-hk.example.test",
              display: "https://competing-hk.example.test",
            }
          : entry,
      );
      return json({ error: "version_conflict", version: 9 }, 409);
    };
    renderDashboard();
    const dialog = await openSetting();
    changeText(dialog, "Value", "https://regional-draft.example.test");
    changeText(dialog, "Reason", "Both regions rollout");
    const both = within(dialog).getByRole("checkbox", {
      name: "Also apply to HK",
    });
    fireEvent.click(both);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    const results = await within(dialog).findByRole("region", {
      name: "Regional results",
    });
    await within(results).findByText("Conflict · not saved");
    expect(results).toHaveTextContent("USSaved · v4");
    expect(results).toHaveTextContent("HKConflict · not saved");
    await waitFor(() =>
      expect(within(results).getByText(/Current value:/)).toHaveTextContent(
        "HK · Current value: https://competing-hk.example.test",
      ),
    );
    expect(within(dialog).getByLabelText("Value")).toHaveValue(
      "https://regional-draft.example.test",
    );
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(both).toBeDisabled();
    const review = within(results).getByRole("button", {
      name: "Review current version",
    });
    await waitFor(() => expect(review).toBeEnabled());
    const beforeReview = requests.length;
    fireEvent.click(review);
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "Save" }),
      ).toBeEnabled(),
    );
    expect(
      requests
        .slice(beforeReview)
        .map(({ method, url }) => [method, url.searchParams.get("region")]),
    ).toEqual([["GET", "hk"]]);
    expect(results).toHaveTextContent("USSaved · v4");
    expect(both).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(results).findByText("Saved · v10")).toBeInTheDocument();
    expect(results).toHaveTextContent("USSaved · v4");
    expect(
      writes().map(({ url, body }) => [
        url.searchParams.get("region"),
        body?.expected_version,
      ]),
    ).toEqual([
      ["us", 3],
      ["hk", 7],
      ["hk", 9],
    ]);
    expect(
      writes().filter(({ url }) => url.searchParams.get("region") === "us"),
    ).toHaveLength(1);
    expect(writes()[2].body?.value).toBe("https://regional-draft.example.test");
  });

  it("Given a partial save, freezes its payload until a new change refreshes versions and writes both regions again", async () => {
    intercept = (request) => {
      if (
        request.method === "PUT" &&
        request.url.searchParams.get("region") === "hk" &&
        writes().filter(({ url }) => url.searchParams.get("region") === "hk")
          .length === 1
      )
        return json({}, 503);
    };
    renderDashboard();
    const dialog = await openSetting();
    changeText(dialog, "Value", "https://change-a.example.test");
    changeText(dialog, "Reason", "Rollout A");
    const both = within(dialog).getByRole("checkbox", {
      name: "Also apply to HK",
    });
    fireEvent.click(both);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    const results = await within(dialog).findByRole("region", {
      name: "Regional results",
    });
    await within(results).findByText("Failed · not saved");
    expect(results).toHaveTextContent("USSaved · v4");
    expect(within(dialog).getByLabelText("Value")).toBeDisabled();
    expect(both).toBeDisabled();
    expect(
      within(dialog).queryByRole("button", { name: "Reset override" }),
    ).not.toBeInTheDocument();
    const startNew = within(dialog).getByRole("button", {
      name: "Start new change",
    });
    await waitFor(() => expect(startNew).toBeEnabled());
    const beforeStart = requests.length;
    fireEvent.click(startNew);
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Value")).toBeEnabled(),
    );
    expect(
      requests
        .slice(beforeStart)
        .map(({ method, url }) => [method, url.searchParams.get("region")]),
    ).toEqual([["GET", "us"]]);
    expect(
      within(dialog).queryByRole("region", { name: "Regional results" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Reset override" }),
    ).toBeInTheDocument();
    expect(both).toBeEnabled();
    expect(both).toBeChecked();
    changeText(dialog, "Value", "https://change-b.example.test");
    changeText(dialog, "Reason", "Rollout B");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    const newResults = await within(dialog).findByRole("region", {
      name: "Regional results",
    });
    await within(newResults).findByText("Saved · v8");
    expect(newResults).toHaveTextContent("USSaved · v5");
    expect(newResults).toHaveTextContent("HKSaved · v8");
    expect(
      writes().map(({ url, body }) => [
        url.searchParams.get("region"),
        body?.expected_version,
        body?.value,
      ]),
    ).toEqual([
      ["us", 3, "https://change-a.example.test"],
      ["hk", 7, "https://change-a.example.test"],
      ["us", 4, "https://change-b.example.test"],
      ["hk", 7, "https://change-b.example.test"],
    ]);
  });

  it("Given a partial reset, retries the failed region with DELETE and never changes the operation to PUT", async () => {
    intercept = (request) => {
      if (
        request.method === "DELETE" &&
        request.url.searchParams.get("region") === "hk" &&
        writes().filter(({ url }) => url.searchParams.get("region") === "hk")
          .length === 1
      )
        return json({}, 503);
    };
    renderDashboard();
    const dialog = await openSetting();
    changeText(dialog, "Reason", "Restore regional environments");
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: "Also apply to HK" }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Reset override" }),
    );
    const results = await within(dialog).findByRole("region", {
      name: "Regional results",
    });
    await within(results).findByText("Failed · not saved");
    expect(results).toHaveTextContent("USSaved · v4");
    expect(
      within(dialog).queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
    const retry = within(dialog).getByRole("button", {
      name: "Reset override",
    });
    expect(retry).toBeDisabled();
    const review = within(results).getByRole("button", {
      name: "Review current version",
    });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    await waitFor(() => expect(retry).toBeEnabled());
    fireEvent.click(retry);
    expect(await within(results).findByText("Saved · v8")).toBeInTheDocument();
    expect(results).toHaveTextContent("USSaved · v4");
    expect(
      writes().map(({ method, url }) => [
        method,
        url.searchParams.get("region"),
        url.searchParams.get("expected_version"),
      ]),
    ).toEqual([
      ["DELETE", "us", "3"],
      ["DELETE", "hk", "7"],
      ["DELETE", "hk", "7"],
    ]);
    expect(writes().some(({ method }) => method === "PUT")).toBe(false);
  });

  it("Given resetting an override, requires a reason and sends DELETE with the current version", async () => {
    renderDashboard();
    const dialog = await openSetting();
    const reset = within(dialog).getByRole("button", {
      name: "Reset override",
    });
    expect(reset).toBeDisabled();
    changeText(dialog, "Reason", "Restore environment config");
    fireEvent.click(reset);
    expect(await within(dialog).findByText("Saved · v4")).toBeInTheDocument();
    expect(writes()).toHaveLength(1);
    expect(writes()[0].method).toBe("DELETE");
    expect(writes()[0].url.searchParams.get("expected_version")).toBe("3");
    expect(writes()[0].url.searchParams.get("reason")).toBe(
      "Restore environment config",
    );
    expect(
      snapshots.us.entries.find(({ key }) => key === "search.url")?.source,
    ).toBe("env");
  });

  it("Given an audit rollback, confirms and sends the current entry version with a new reason", async () => {
    renderDashboard();
    await screen.findByRole("button", { name: "Edit Secretary" });
    fireEvent.click(screen.getByRole("tab", { name: "Change history" }));
    fireEvent.click(await screen.findByRole("button", { name: "Revert" }));
    const dialog = screen.getByRole("dialog", { name: "Revert Search URL" });
    const revert = within(dialog).getByRole("button", { name: "Revert" });
    expect(revert).toBeDisabled();
    changeText(dialog, "Reason", "Restore known good search");
    fireEvent.click(revert);
    const confirmation = screen.getByRole("dialog", { name: "Confirm revert" });
    expect(confirmation).toHaveTextContent("US");
    expect(writes()).toHaveLength(0);
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "Confirm" }),
    );
    expect(await within(dialog).findByText("Saved · v4")).toBeInTheDocument();
    expect(writes()[0].url.pathname).toBe(
      "/api/pax/api/v1/admin/config/audit/101/revert",
    );
    expect(writes()[0]).toMatchObject({
      method: "POST",
      body: { expected_version: 3, reason: "Restore known good search" },
    });
  });

  it.each(["off", "ga"])(
    "Given a feature changing to %s, requires an explicit impact confirmation",
    async (stage) => {
      renderDashboard();
      fireEvent.click(
        await screen.findByRole("button", { name: "Edit Secretary" }),
      );
      const dialog = screen.getByRole("dialog", { name: "Edit Secretary" });
      fireEvent.change(within(dialog).getByLabelText("Feature stage"), {
        target: { value: stage },
      });
      changeText(dialog, "Reason", "Change feature access");
      fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
      const confirmation = screen.getByRole("dialog", {
        name: "Confirm feature access change",
      });
      expect(confirmation).toHaveTextContent(
        stage === "ga"
          ? "All signed-in users in US"
          : "No users in US, including administrators",
      );
      expect(confirmation).toHaveTextContent("Secretary");
      expect(writes()).toHaveLength(0);
      fireEvent.click(
        within(confirmation).getByRole("button", { name: "Confirm" }),
      );
      await waitFor(() => expect(writes()).toHaveLength(1));
      expect(writes()[0].body?.value).toEqual({ stage, beta_emails: [] });
    },
  );

  it("Given a secret replacement, starts empty, clears the draft, and keeps plaintext out of Query and Mutation data", async () => {
    const { client } = renderDashboard();
    const dialog = await openSetting("Search API key");
    expect(within(dialog).getByLabelText("Value")).toHaveValue("");
    expect(within(dialog).getByLabelText("Value")).toHaveAttribute(
      "type",
      "password",
    );
    expect(within(dialog).getByLabelText("Value")).toHaveAttribute(
      "placeholder",
      "Already set sk-…a3f2; enter a new value to replace",
    );
    changeText(dialog, "Value", "private-token-for-test");
    changeText(dialog, "Reason", "Rotate search credential");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Saved · v3")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Value")).toHaveValue("");
    expect(writes()[0].body?.value).toBe("private-token-for-test");
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((query) => query.state),
      ),
    ).not.toContain("private-token-for-test");
    expect(
      JSON.stringify(
        client
          .getMutationCache()
          .getAll()
          .map((mutation) => mutation.state),
      ),
    ).not.toContain("private-token-for-test");
  });

  it("Given a secret connection test, a retained mutation function cannot resend the cleared secret", async () => {
    const { client } = renderDashboard();
    const dialog = await openSetting("Search API key");
    changeText(dialog, "Value", "closure-secret-for-test");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Test connection" }),
    );
    const retainedMutation = client
      .getMutationCache()
      .getAll()
      .find((mutation) => mutation.state.status === "pending");
    expect(retainedMutation?.options.mutationFn).toBeTypeOf("function");
    const retainedFunction = retainedMutation!.options.mutationFn!;
    expect(
      await within(dialog).findByText("Connection succeeded (180 ms)"),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Value")).toHaveValue("");
    expect(writes()[0].body).toEqual({
      group: "search",
      overrides: { "search.api_key": "closure-secret-for-test" },
    });

    await act(async () => {
      await retainedFunction(undefined, {
        client,
        meta: undefined,
        mutationKey: undefined,
      });
    });
    expect(writes()).toHaveLength(2);
    expect(writes()[1].body).toEqual({
      group: "search",
      overrides: { "search.api_key": "" },
    });
    expect(JSON.stringify(writes()[1].body)).not.toContain(
      "closure-secret-for-test",
    );
  });

  it("Given HK copying a US value, copies only into the non-secret draft until saved", async () => {
    useConfigAdminStore.setState({ region: "hk" });
    renderDashboard();
    const dialog = await openSetting();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Copy value from US" }),
    );
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Value")).toHaveValue(
        "https://us-search.example.test",
      ),
    );
    expect(writes()).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Edit Search API key" }),
    );
    const secretDialog = screen.getByRole("dialog", {
      name: "Edit Search API key",
    });
    expect(
      within(secretDialog).queryByRole("button", {
        name: "Copy value from US",
      }),
    ).not.toBeInTheDocument();
    expect(within(secretDialog).getByLabelText("Value")).toHaveValue("");
  });
});
