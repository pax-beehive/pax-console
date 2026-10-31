/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render as rtlRender,
  screen,
  within,
} from "@testing-library/react";
import { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError, AuthError } from "@/features/api/errors";
import { useAgents } from "@/features/api/resources";
import {
  SecretarySettings,
  useSecretarySettings,
  useUpdateSecretarySettings,
  useRunSecretaryNow,
} from "@/features/api/secretary";
import { SecretarySettingsPanel } from "./secretary-settings-page";
import { useSecretaryProgress } from "@/features/api/secretary-progress";

vi.mock("@/features/api/resources", () => ({ useAgents: vi.fn() }));
vi.mock("@/features/api/secretary-progress", () => ({
  useSecretaryProgress: vi.fn(),
}));
vi.mock("@/features/api/secretary", async (original) => ({
  ...(await original<object>()),
  useSecretarySettings: vi.fn(),
  useUpdateSecretarySettings: vi.fn(),
  useRunSecretaryNow: vi.fn(),
}));
const render = (ui: ReactElement) =>
  rtlRender(ui, { wrapper: TooltipProvider });
const saved: SecretarySettings = {
  enabled: false,
  revision: 0,
  state: "disabled",
  pending_count: 0,
  agent_available: false,
};
const configured: SecretarySettings = {
  ...saved,
  agent_id: "agent_1",
  enabled: true,
  revision: 4,
  state: "idle",
  agent_available: true,
};
const owned = [
  {
    agent_id: "agent_1",
    name: "My agent",
    owner_user_id: "owner",
    online: true,
  },
  {
    agent_id: "offline",
    name: "Travel agent",
    owner_user_id: "owner",
    online: false,
  },
];
function settingsState(data = saved) {
  return {
    data,
    isPending: false,
    isError: false,
    error: null as Error | null,
    refetch: vi.fn(),
  };
}
function agentsState() {
  return {
    data: { agents: owned },
    isPending: false,
    isError: false,
    error: null as Error | null,
    refetch: vi.fn(),
  };
}
function mutationState() {
  return {
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null as Error | null,
    mutate: vi.fn(),
    reset: vi.fn(),
  };
}
function setSettings(value: ReturnType<typeof settingsState>) {
  vi.mocked(useSecretarySettings).mockReturnValue(
    value as unknown as ReturnType<typeof useSecretarySettings>,
  );
}
function setAgents(value: ReturnType<typeof agentsState>) {
  vi.mocked(useAgents).mockReturnValue(
    value as unknown as ReturnType<typeof useAgents>,
  );
}
function setSave(value: ReturnType<typeof mutationState>) {
  vi.mocked(useUpdateSecretarySettings).mockReturnValue(
    value as unknown as ReturnType<typeof useUpdateSecretarySettings>,
  );
}
function setRun(value: ReturnType<typeof mutationState>) {
  vi.mocked(useRunSecretaryNow).mockReturnValue(
    value as unknown as ReturnType<typeof useRunSecretaryNow>,
  );
}
function setup() {
  return render(<SecretarySettingsPanel userId="owner" />);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  setSettings(settingsState());
  setAgents(agentsState());
  setSave(mutationState());
  setRun(mutationState());
  vi.mocked(useSecretaryProgress).mockReturnValue({
    data: {
      pages: [
        {
          as_of: "2026-10-31T12:00:00Z",
          counts: {
            total_sessions: 0,
            completed_sessions: 0,
            partial_sessions: 0,
            unstarted_sessions: 0,
            total_messages: 0,
            completed_messages: 0,
            pending_messages: 0,
            total_turns: 0,
            completed_turns: 0,
            pending_turns: 0,
            ungrouped_messages: 0,
          },
          sessions: [],
        },
      ],
    },
    isPending: false,
    isError: false,
    error: null,
    isFetching: false,
    hasNextPage: false,
    restart: vi.fn(),
    fetchNextPage: vi.fn(),
  } as unknown as ReturnType<typeof useSecretaryProgress>);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Secretary settings", () => {
  it("keeps an unsaved configuration draft when only progress updates", () => {
    const view = setup();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "offline" },
    });
    fireEvent.click(screen.getByRole("switch"));
    const old = vi.mocked(useSecretaryProgress).mock.results.at(-1)
      ?.value as ReturnType<typeof useSecretaryProgress>;
    vi.mocked(useSecretaryProgress).mockReturnValue({
      ...old,
      data: {
        pages: [
          {
            ...old.data!.pages[0],
            as_of: "2026-10-31T12:00:30Z",
            counts: {
              ...old.data!.pages[0].counts,
              total_sessions: 12,
              unstarted_sessions: 12,
            },
          },
        ],
        pageParams: [undefined],
      },
    } as unknown as ReturnType<typeof useSecretaryProgress>);
    view.rerender(<SecretarySettingsPanel userId="owner" />);
    expect(screen.getByRole("combobox")).toHaveValue("offline");
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });
  it("starts disabled, uses owned agents and never saves without an explicit action", () => {
    const mutation = mutationState();
    setSave(mutation);
    setup();
    expect(useAgents).toHaveBeenCalledWith("owner", "owned");
    expect(
      screen.getByRole("switch", { name: "Automatic summaries" }),
    ).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Save settings" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Run now" }),
    ).not.toBeInTheDocument();
    expect(mutation.mutate).not.toHaveBeenCalled();
  });
  it("saves one selected owned agent and explicit enablement with the server revision", () => {
    const mutation = mutationState();
    setSave(mutation);
    setup();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Secretary agent" }),
      { target: { value: "agent_1" } },
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(
      screen.getByRole("region", { name: "Secretary status" }),
    ).toHaveTextContent("Off");
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(mutation.mutate).toHaveBeenCalledWith({
      agent_id: "agent_1",
      enabled: true,
      expected_revision: 0,
    });
  });
  it("keeps offline owned agents selectable and explains that work waits", () => {
    const mutation = mutationState();
    setSave(mutation);
    setup();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "offline" },
    });
    expect(screen.getByText(/This agent is offline/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(mutation.mutate).toHaveBeenCalledWith({
      agent_id: "offline",
      enabled: true,
      expected_revision: 0,
    });
  });
  it("filters explicitly non-owned agents even if returned in an owned list", () => {
    setAgents({
      ...agentsState(),
      data: {
        agents: [
          ...owned,
          {
            agent_id: "foreign",
            name: "Someone else's agent",
            owner_user_id: "another",
            online: true,
          },
        ],
      },
    });
    setup();
    expect(
      screen.queryByRole("option", { name: "Someone else's agent" }),
    ).not.toBeInTheDocument();
  });
  it("hides cached agent names when inventory access is denied", () => {
    setAgents({ ...agentsState(), isError: true, error: new AuthError() });
    setup();
    expect(
      screen.queryByRole("option", { name: "My agent" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Travel agent/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
  it("allows disabling and clearing a removed or non-owned saved agent", () => {
    setSettings(
      settingsState({
        ...configured,
        agent_id: "removed",
        agent_available: false,
        state: "waiting_for_agent",
      }),
    );
    const mutation = mutationState();
    setSave(mutation);
    setup();
    expect(
      screen.getByText(/The saved agent is no longer available/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save settings" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(mutation.mutate).toHaveBeenCalledWith({
      agent_id: "",
      enabled: false,
      expected_revision: 4,
    });
  });
  it("can still disable when the agent inventory cannot be loaded", () => {
    setSettings(settingsState(configured));
    setAgents({ ...agentsState(), data: { agents: [] }, isError: true });
    const mutation = mutationState();
    setSave(mutation);
    setup();
    expect(screen.getByRole("combobox")).toBeDisabled();
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(mutation.mutate).toHaveBeenCalledWith({
      agent_id: "",
      enabled: false,
      expected_revision: 4,
    });
  });
  it("clears a cached agent while disabling after an inventory read failure", () => {
    setSettings(settingsState(configured));
    setAgents({ ...agentsState(), isError: true });
    const mutation = mutationState();
    setSave(mutation);
    setup();
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(mutation.mutate).toHaveBeenCalledWith({
      agent_id: "",
      enabled: false,
      expected_revision: 4,
    });
  });
  it("persists disablement only after saving and reflects the server response", () => {
    setSettings(settingsState(configured));
    const mutation = mutationState();
    setSave(mutation);
    const view = setup();
    fireEvent.click(screen.getByRole("switch"));
    expect(
      screen.getByRole("region", { name: "Secretary status" }),
    ).toHaveTextContent("Ready");
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(mutation.mutate).toHaveBeenCalledWith({
      agent_id: "agent_1",
      enabled: false,
      expected_revision: 4,
    });
    setSettings(
      settingsState({
        ...configured,
        enabled: false,
        revision: 5,
        state: "disabled",
      }),
    );
    view.rerender(<SecretarySettingsPanel userId="owner" />);
    expect(
      screen.getByRole("region", { name: "Secretary status" }),
    ).toHaveTextContent("Off");
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByRole("button", { name: "Save settings" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Run now" }),
    ).not.toBeInTheDocument();
  });
  it("retains saved state and the editable draft when saving fails", () => {
    const view = setup();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "agent_1" },
    });
    fireEvent.click(screen.getByRole("switch"));
    setSave({
      ...mutationState(),
      isError: true,
      error: new ApiError("unavailable", 503, {}),
    });
    view.rerender(<SecretarySettingsPanel userId="owner" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not confirm your changes",
    );
    expect(
      screen.getByRole("region", { name: "Secretary status" }),
    ).toHaveTextContent("Off");
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("combobox")).toHaveValue("agent_1");
  });
  it("shows a revision conflict and resets the draft to refetched server settings", () => {
    const view = setup();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "offline" },
    });
    setSave({
      ...mutationState(),
      isError: true,
      error: new ApiError("conflict", 409, {}),
    });
    setSettings(settingsState(configured));
    view.rerender(<SecretarySettingsPanel userId="owner" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Settings changed in another window",
    );
    expect(screen.getByRole("combobox")).toHaveValue("agent_1");
    expect(
      screen.getByRole("button", { name: "Save settings" }),
    ).toBeDisabled();
  });
  it("handles loading and unavailable backend without enabling anything", () => {
    setSettings({ ...settingsState(), isPending: true });
    const view = setup();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading Secretary settings",
    );
    const state = {
      ...settingsState(),
      isError: true,
      error: new ApiError("missing", 404, {}),
    };
    setSettings(state);
    view.rerender(<SecretarySettingsPanel userId="owner" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Secretary is unavailable",
    );
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry settings" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
  it("shows live work, last completion, queue and bounded errors", () => {
    setSettings(
      settingsState({
        ...configured,
        state: "processing",
        pending_count: 3,
        last_completed_at: "2026-11-01T12:00:00Z",
        last_error: "x".repeat(800),
      }),
    );
    setup();
    const status = screen.getByRole("region", { name: "Secretary status" });
    expect(status).toHaveTextContent("Processing");
    expect(status).toHaveTextContent("3 conversations");
    expect(
      within(status).queryByText("No completed runs yet"),
    ).not.toBeInTheDocument();
    expect(within(status).getByText(/x{30}/).textContent).toHaveLength(400);
    expect(screen.getByRole("button", { name: "Run now" })).toBeDisabled();
  });
  it("requests and retries work only when the persisted settings allow it", () => {
    setSettings(settingsState(configured));
    const mutation = mutationState();
    setRun(mutation);
    const view = setup();
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    expect(mutation.mutate).toHaveBeenCalledOnce();
    setSettings(settingsState({ ...configured, state: "error" }));
    view.rerender(<SecretarySettingsPanel userId="owner" />);
    expect(screen.getByRole("button", { name: "Retry run" })).toBeEnabled();
    setSettings(
      settingsState({
        ...configured,
        agent_available: false,
        state: "waiting_for_agent",
      }),
    );
    view.rerender(<SecretarySettingsPanel userId="owner" />);
    expect(screen.getByRole("button", { name: "Run now" })).toBeDisabled();
    expect(
      screen.getByText(/A run will wait until the selected agent reconnects/),
    ).toBeInTheDocument();
  });
});
