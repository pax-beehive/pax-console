// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/features/api/errors";
import { useLocaleStore } from "@/features/i18n/locale-store";
import type { Region } from "@/features/region/bootstrap";
import {
  configKeys,
  getConfig,
  resetConfig,
  revertConfig,
  setConfig,
  type ConfigAuditItem,
  type ConfigEntry,
  type ConfigSnapshot,
  type ConfigValue,
} from "@/features/runtime-config";
import { ConfigEditor } from "./config-editor";

vi.mock("@/features/runtime-config", async (original) => ({
  ...(await original<typeof import("@/features/runtime-config")>()),
  getConfig: vi.fn(),
  setConfig: vi.fn(),
  resetConfig: vi.fn(),
  revertConfig: vi.fn(),
}));

const feature: ConfigEntry = {
  key: "feature.secretary",
  kind: "feature",
  group: "features",
  label: "Secretary",
  description: "",
  type: "feature",
  options: null,
  secret: false,
  value: { stage: "admin", beta_emails: ["retained@example.test"] },
  display: "admin",
  has_value: true,
  source: "db",
  env_var: "",
  default_display: "admin",
  apply: "live",
  pending_restart: false,
  testable: false,
  version: 3,
  updated_at: null,
  updated_by: null,
};
const setting: ConfigEntry = {
  ...feature,
  key: "search.url",
  kind: "setting",
  group: "search",
  label: "Search URL",
  type: "url",
  value: "https://current.example.test",
  display: "https://current.example.test",
};
const audit: ConfigAuditItem = {
  id: 42,
  key: "search.url",
  action: "set",
  old_display: "https://previous.example.test",
  new_display: "https://current.example.test",
  version: 2,
  actor: "admin@example.test",
  reason: "Previous update",
  created_at: "2026-11-16T12:00:00Z",
  revertible: true,
};
let snapshots: Record<Region, ConfigSnapshot>;
const clients: QueryClient[] = [];
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function saved(region: Region, key: string, value?: ConfigValue) {
  const previous = snapshots[region].entries.find(
    (entry) => entry.key === key,
  )!;
  const next = {
    ...previous,
    version: previous.version + 1,
    ...(value === undefined ? {} : { value }),
  };
  snapshots[region].entries = snapshots[region].entries.map((entry) =>
    entry.key === key ? next : entry,
  );
  return clone(next);
}
function renderEditor({
  entry = feature,
  auditItem,
}: { entry?: ConfigEntry; auditItem?: ConfigAuditItem } = {}) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  clients.push(client);
  for (const region of ["us", "hk"] as Region[])
    client.setQueryData(
      configKeys.snapshot("admin", region),
      clone(snapshots[region]),
    );
  const onClose = vi.fn();
  function View() {
    const { data } = useQuery({
      queryKey: configKeys.snapshot("admin", "us"),
      queryFn: () => getConfig("us"),
    });
    return (
      <ConfigEditor
        userId="admin"
        region="us"
        entry={data!.entries.find((item) => item.key === entry.key)!}
        snapshot={data!}
        audit={auditItem}
        onClose={onClose}
      />
    );
  }
  const view = render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <View />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return {
    ...view,
    client,
    onClose,
    dialog: screen.getByRole("dialog", {
      name: `${auditItem ? "Revert" : "Edit"} ${entry.label}`,
    }),
  };
}
const text = (dialog: HTMLElement, name: string, value: string) =>
  fireEvent.change(within(dialog).getByLabelText(name), { target: { value } });
const stage = (dialog: HTMLElement, value: number) =>
  fireEvent.change(
    within(dialog).getByRole("slider", { name: "Feature stage" }),
    { target: { value: String(value) } },
  );

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.resetAllMocks();
  useLocaleStore.setState({ locale: "en" });
  snapshots = Object.fromEntries(
    (["us", "hk"] as Region[]).map((region) => [
      region,
      {
        region,
        revision: 42,
        vault_configured: true,
        health: { last_refresh_at: null, refresh_failures: 0, degraded: false },
        entries: [feature, setting].map((entry) => ({
          ...clone(entry),
          version: region === "us" ? 3 : 7,
        })),
      },
    ]),
  ) as Record<Region, ConfigSnapshot>;
  vi.mocked(getConfig).mockImplementation(async (region) =>
    clone(snapshots[region]),
  );
  vi.mocked(setConfig).mockImplementation(async (region, key, request) =>
    saved(region, key, request.value),
  );
  vi.mocked(resetConfig).mockImplementation(async (region, key) =>
    saved(region, key),
  );
  vi.mocked(revertConfig).mockImplementation(async (region) =>
    saved(region, audit.key, audit.old_display),
  );
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.unstubAllGlobals();
});

describe("feature stage editing", () => {
  it("Given stage changes, previews current and pending stages while retaining the beta draft", async () => {
    const { dialog } = renderEditor();
    expect(
      within(dialog).getByText("Currently effective: Admin only"),
    ).toBeInTheDocument();
    stage(dialog, 2);
    text(dialog, "Beta emails", "new@example.test\nretained@example.test");
    stage(dialog, 3);
    expect(
      within(dialog).queryByLabelText("Beta emails"),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "The beta list is retained for this draft and is not used at this stage.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Pending save: General availability"),
    ).toBeInTheDocument();
    stage(dialog, 2);
    expect(within(dialog).getByLabelText("Beta emails")).toHaveValue(
      "new@example.test\nretained@example.test",
    );
    expect(setConfig).not.toHaveBeenCalled();
  });

  it("Given an empty reason or invalid beta email, shows a field error and does not write", async () => {
    const { dialog } = renderEditor();
    stage(dialog, 2);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    expect(
      within(dialog).getByText("Enter a reason for this change."),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Reason")).toHaveFocus();
    text(dialog, "Reason", "Roll out trial");
    text(dialog, "Beta emails", "invalid-email");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    expect(
      within(dialog).getByText("Enter a valid email address on each line."),
    ).toBeInTheDocument();
    expect(setConfig).not.toHaveBeenCalled();
  });

  it("Given cancelling an unsaved edit, reopening starts from the effective configuration", () => {
    const first = renderEditor();
    stage(first.dialog, 2);
    text(first.dialog, "Beta emails", "discarded@example.test");
    text(first.dialog, "Reason", "Discard this draft");
    fireEvent.click(
      within(first.dialog).getByRole("button", { name: "Cancel" }),
    );
    expect(first.onClose).toHaveBeenCalledTimes(1);
    first.unmount();
    const { dialog } = renderEditor();
    expect(within(dialog).getByRole("slider")).toHaveValue("1");
    expect(within(dialog).getByLabelText("Reason")).toHaveValue("");
    stage(dialog, 2);
    expect(within(dialog).getByLabelText("Beta emails")).toHaveValue(
      "retained@example.test",
    );
    expect(setConfig).not.toHaveBeenCalled();
  });

  it.each([0, 3])(
    "Given an extreme stage %s, cancelling or escaping confirmation retains the drawer draft",
    async (target) => {
      const { dialog, onClose } = renderEditor();
      stage(dialog, target);
      text(dialog, "Reason", "Scope change");
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Save changes" }),
      );
      let confirmation = screen.getByRole("dialog", {
        name: "Confirm feature access change",
      });
      fireEvent.click(
        within(confirmation).getByRole("button", { name: "Back to editing" }),
      );
      expect(
        screen.getByRole("dialog", { name: "Edit Secretary" }),
      ).toBeInTheDocument();
      expect(within(dialog).getByLabelText("Reason")).toHaveValue(
        "Scope change",
      );
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Save changes" }),
      );
      confirmation = screen.getByRole("dialog", {
        name: "Confirm feature access change",
      });
      fireEvent.keyDown(confirmation, { key: "Escape" });
      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", {
            name: "Confirm feature access change",
          }),
        ).not.toBeInTheDocument(),
      );
      expect(onClose).not.toHaveBeenCalled();
      fireEvent.keyDown(dialog, { key: "Escape" });
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(setConfig).not.toHaveBeenCalled();
    },
  );

  it("Given a partial save, locks the submission and retries only the reviewed failed region", async () => {
    vi.mocked(setConfig).mockImplementation(async (region, key, request) => {
      if (
        region === "hk" &&
        vi.mocked(setConfig).mock.calls.filter(([target]) => target === "hk")
          .length === 1
      )
        throw new Error("unavailable");
      return saved(region, key, request.value);
    });
    const { dialog, onClose } = renderEditor();
    stage(dialog, 2);
    text(dialog, "Beta emails", "trial@example.test");
    text(dialog, "Reason", "Frozen reason");
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: "Also apply to HK" }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await within(dialog).findByText("Failed · not saved");
    expect(within(dialog).getByLabelText("Reason")).toBeDisabled();
    expect(within(dialog).getByLabelText("Beta emails")).toBeDisabled();
    expect(within(dialog).getByRole("slider")).toBeDisabled();
    const retry = within(dialog).getByRole("button", { name: "Only retry HK" });
    expect(retry).toBeDisabled();
    // A synthetic change must not alter the frozen payload even if an event is delivered.
    text(dialog, "Reason", "Do not submit this reason");
    text(dialog, "Beta emails", "do-not-submit@example.test");
    snapshots.hk.entries[0].version = 11;
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Review current version" }),
    );
    await waitFor(() => expect(retry).toBeEnabled());
    expect(
      within(dialog).getByText(
        "Latest HK: Admin only · retained@example.test · v11",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Pending value: Beta · trial@example.test; retry uses the reviewed version.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(retry);
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "Finish editing" }),
      ).toBeEnabled(),
    );
    expect(
      vi
        .mocked(setConfig)
        .mock.calls.map(([region, , request]) => [region, request]),
    ).toEqual([
      [
        "us",
        {
          value: { stage: "beta", beta_emails: ["trial@example.test"] },
          reason: "Frozen reason",
          expected_version: 3,
        },
      ],
      [
        "hk",
        {
          value: { stage: "beta", beta_emails: ["trial@example.test"] },
          reason: "Frozen reason",
          expected_version: 7,
        },
      ],
      [
        "hk",
        {
          value: { stage: "beta", beta_emails: ["trial@example.test"] },
          reason: "Frozen reason",
          expected_version: 11,
        },
      ],
    ]);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Finish editing" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Given a conflict, keeps the draft and requires review before retrying with the latest version", async () => {
    vi.mocked(setConfig).mockImplementationOnce(async () => {
      snapshots.us.entries[0] = {
        ...snapshots.us.entries[0],
        version: 9,
        value: { stage: "ga", beta_emails: [] },
      };
      throw new ApiError("conflict", 409, {
        data: { error: "version_conflict", version: 9 },
      });
    });
    const { dialog } = renderEditor();
    stage(dialog, 2);
    text(dialog, "Reason", "Preserve trial draft");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await within(dialog).findByText("Conflict · not saved");
    const retry = within(dialog).getByRole("button", { name: "Only retry US" });
    expect(retry).toBeDisabled();
    expect(setConfig).toHaveBeenCalledTimes(1);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Review current version" }),
    );
    await waitFor(() => expect(retry).toBeEnabled());
    expect(
      within(dialog).getByText("Latest US: General availability · v9"),
    ).toBeInTheDocument();
    fireEvent.click(retry);
    await waitFor(() => expect(setConfig).toHaveBeenCalledTimes(2));
    expect(vi.mocked(setConfig).mock.calls[1][2]).toMatchObject({
      expected_version: 9,
      value: { stage: "beta" },
      reason: "Preserve trial draft",
    });
  });

  it("Given a new change after partial success, reloads the draft and keeps both regions selected", async () => {
    vi.mocked(setConfig).mockImplementation(async (region, key, request) => {
      if (region === "hk") throw new Error("unavailable");
      return saved(region, key, request.value);
    });
    const { dialog } = renderEditor();
    stage(dialog, 2);
    text(dialog, "Reason", "First change");
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: "Also apply to HK" }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await within(dialog).findByText("Failed · not saved");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Start new change" }),
    );
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Reason")).toBeEnabled(),
    );
    expect(
      within(dialog).getByRole("checkbox", { name: "Also apply to HK" }),
    ).toBeChecked();
    expect(
      within(dialog).queryByRole("region", { name: "Regional results" }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByRole("slider")).toHaveValue("2");
  });
});

describe("other configuration operations", () => {
  it("Given a partial feature reset, displays the returned effective stage and retries only the failed region with DELETE", async () => {
    vi.mocked(resetConfig).mockImplementation(async (region, key) => {
      if (
        region === "hk" &&
        vi.mocked(resetConfig).mock.calls.filter(([target]) => target === "hk")
          .length === 1
      )
        throw new Error("unavailable");
      return saved(region, key, {
        stage: "admin",
        beta_emails: ["default@example.test"],
      });
    });
    const { dialog, client } = renderEditor();
    stage(dialog, 2);
    text(dialog, "Beta emails", "unsaved@example.test");
    text(dialog, "Reason", "Restore registered defaults");
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: "Also apply to HK" }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Reset override" }),
    );
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "Confirm feature access change" }),
      ).getByRole("button", { name: "Confirm" }),
    );
    await within(dialog).findByText("Failed · not saved");
    const slider = within(dialog).getByRole("slider");
    expect(slider).toBeDisabled();
    expect(slider).toHaveValue("1");
    expect(
      within(dialog).getByText("Available to administrators only."),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText("Beta emails"),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByText("This submission: Reset override"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        client.getQueryData<ConfigSnapshot>(configKeys.snapshot("admin", "us"))
          ?.entries[0].value,
      ).toEqual({ stage: "admin", beta_emails: ["default@example.test"] }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Review current version" }),
    );
    const retry = within(dialog).getByRole("button", { name: "Only retry HK" });
    await waitFor(() => expect(retry).toBeEnabled());
    fireEvent.click(retry);
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "Confirm feature access change" }),
      ).getByRole("button", { name: "Confirm" }),
    );
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "Finish editing" }),
      ).toBeEnabled(),
    );
    expect(
      vi
        .mocked(resetConfig)
        .mock.calls.map(([region, key, request]) => [
          region,
          key,
          request.reason,
        ]),
    ).toEqual([
      ["us", "feature.secretary", "Restore registered defaults"],
      ["hk", "feature.secretary", "Restore registered defaults"],
      ["hk", "feature.secretary", "Restore registered defaults"],
    ]);
    expect(slider).toHaveValue("1");
    expect(setConfig).not.toHaveBeenCalled();
  });

  it("Given a partial reset, retries DELETE with the frozen reason and reviewed version", async () => {
    vi.mocked(resetConfig).mockImplementationOnce(async () => {
      throw new Error("unavailable");
    });
    const { dialog } = renderEditor({ entry: setting });
    text(dialog, "Reason", "Restore defaults");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Reset override" }),
    );
    await within(dialog).findByText("Failed · not saved");
    text(dialog, "Reason", "New unsent reason");
    snapshots.us.entries[1].version = 6;
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Review current version" }),
    );
    const retry = within(dialog).getByRole("button", {
      name: "Reset override",
    });
    await waitFor(() => expect(retry).toBeEnabled());
    fireEvent.click(retry);
    await waitFor(() => expect(resetConfig).toHaveBeenCalledTimes(2));
    expect(vi.mocked(resetConfig).mock.calls[1]).toEqual([
      "us",
      "search.url",
      { expected_version: 6, reason: "Restore defaults" },
    ]);
    expect(setConfig).not.toHaveBeenCalled();
  });

  it("Given a rollback conflict, retries the same audit action with its frozen reason", async () => {
    vi.mocked(revertConfig).mockRejectedValueOnce(
      new ApiError("conflict", 409, {
        data: { error: "version_conflict", version: 6 },
      }),
    );
    const { dialog } = renderEditor({ entry: setting, auditItem: audit });
    text(dialog, "Reason", "Revert original rollout");
    fireEvent.click(within(dialog).getByRole("button", { name: "Revert" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Confirm revert" })).getByRole(
        "button",
        { name: "Confirm" },
      ),
    );
    await within(dialog).findByText("Conflict · not saved");
    snapshots.us.entries[1].version = 6;
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Review current version" }),
    );
    const retry = within(dialog).getByRole("button", { name: "Revert" });
    await waitFor(() => expect(retry).toBeEnabled());
    fireEvent.click(retry);
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Confirm revert" })).getByRole(
        "button",
        { name: "Confirm" },
      ),
    );
    await waitFor(() => expect(revertConfig).toHaveBeenCalledTimes(2));
    expect(vi.mocked(revertConfig).mock.calls[1]).toEqual([
      "us",
      42,
      { expected_version: 6, reason: "Revert original rollout" },
    ]);
    expect(setConfig).not.toHaveBeenCalled();
  });
});
