/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError, AuthError } from "@/features/api/errors";
import {
  useSecretaryTasks,
  useSecretaryTaskDetail,
  useSecretaryTaskAction,
  type SecretaryTask,
} from "@/features/api/secretary-tasks";
import { SecretaryTaskList } from "./secretary-tasks";

vi.mock("@/features/api/secretary-tasks", () => ({
  useSecretaryTasks: vi.fn(),
  useSecretaryTaskDetail: vi.fn(),
  useSecretaryTaskAction: vi.fn(),
}));
const task: SecretaryTask = {
  task_id: "42",
  title: "Database design",
  session_id: "source",
  source_agent_id: "agent",
  secretary_agent_id: "secretary",
  revision: 5,
  settings_revision: 2,
  retry_epoch: 3,
  batch_id: "batch",
  attempt_id: "attempt",
  execution_state: "unknown",
  paused: false,
  lease_active: false,
  attempt_count: 2,
  connection_failures: 1,
  error_code: "model_connection_failed",
  error_message: "private raw error",
  execution_session_id: "execution",
  execution_agent_id: "secretary",
};
function query() {
  return {
    data: {
      pages: [
        {
          items: [
            task,
            {
              ...task,
              task_id: "43",
              title: "Search design",
              execution_session_id: undefined,
            },
          ],
        },
      ],
    },
    isPending: false,
    isError: false,
    error: null,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    restart: vi.fn(),
    fetchNextPage: vi.fn(),
  };
}
function mutation() {
  return {
    isPending: false,
    isError: false,
    error: null as Error | null,
    isSuccess: false,
    data: undefined as { outcome?: string } | undefined,
    mutate: vi.fn(),
    reset: vi.fn(),
  };
}
const actions = new Map<string, ReturnType<typeof mutation>>();
function setup() {
  return render(
    <TooltipProvider>
      <SecretaryTaskList userId="owner" enabled />
    </TooltipProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  actions.clear();
  vi.mocked(useSecretaryTasks).mockReturnValue(
    query() as unknown as ReturnType<typeof useSecretaryTasks>,
  );
  vi.mocked(useSecretaryTaskAction).mockImplementation((_user, id) => {
    if (!actions.has(id)) actions.set(id, mutation());
    return actions.get(id)! as unknown as ReturnType<
      typeof useSecretaryTaskAction
    >;
  });
  vi.mocked(useSecretaryTaskDetail).mockReturnValue({
    data: undefined,
    isPending: true,
    isError: false,
    error: null,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    restart: vi.fn(),
    fetchNextPage: vi.fn(),
  } as unknown as ReturnType<typeof useSecretaryTaskDetail>);
});
afterEach(cleanup);

describe("Secretary per-task controls", () => {
  it("shows a fixed model-connection explanation and only permission-checked execution links", () => {
    setup();
    const row = screen.getByRole("article", { name: "Database design" });
    expect(row).toHaveTextContent("Model connection failed");
    expect(row).not.toHaveTextContent("private raw error");
    expect(
      within(row).getByRole("link", { name: "View execution" }),
    ).toHaveAttribute("href", "/?session_id=execution");
    expect(
      within(
        screen.getByRole("article", { name: "Search design" }),
      ).queryByRole("link", { name: "View execution" }),
    ).not.toBeInTheDocument();
    expect(row).toHaveTextContent("2 attempts");
  });
  it("requires explicit duplicate-risk confirmation before restarting only the observed task", () => {
    setup();
    const row = screen.getByRole("article", { name: "Database design" });
    fireEvent.click(
      within(row).getByRole("button", { name: "Retry this task" }),
    );
    expect(actions.get("42")!.mutate).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("may still be running");
    expect(dialog).toHaveTextContent("duplicate work");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Restart this task" }),
    );
    expect(actions.get("42")!.mutate).toHaveBeenCalledWith({
      action: "retry",
      expected_revision: 5,
      batch_id: "batch",
      attempt_id: "attempt",
      retry_epoch: 3,
      settings_revision: 2,
      confirm_restart: true,
    });
    expect(actions.get("43")!.mutate).not.toHaveBeenCalled();
  });
  it("checks only an existing execution without requesting a fresh model call", () => {
    setup();
    fireEvent.click(
      within(
        screen.getByRole("article", { name: "Database design" }),
      ).getByRole("button", { name: "Check existing result" }),
    );
    expect(actions.get("42")!.mutate).toHaveBeenCalledWith({
      action: "recheck",
      expected_revision: 5,
      batch_id: "batch",
      attempt_id: "attempt",
      retry_epoch: 3,
      settings_revision: 2,
    });
    expect(
      screen.getByText(/Checking uses the existing execution/),
    ).toBeInTheDocument();
  });
  it("disables restart and recheck during an active lease but permits pausing future work", () => {
    const value = query();
    value.data.pages[0].items = [
      { ...task, execution_state: "running", lease_active: true },
    ];
    vi.mocked(useSecretaryTasks).mockReturnValue(
      value as unknown as ReturnType<typeof useSecretaryTasks>,
    );
    setup();
    expect(
      screen.getByRole("button", { name: "Retry this task" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Check existing result" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Pause future retries" }),
    );
    expect(actions.get("42")!.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ action: "pause" }),
    );
    expect(
      screen.getByText(/does not cancel an execution/),
    ).toBeInTheDocument();
  });
  it("keeps pending controls isolated to one task and allows responsive wrapping", () => {
    actions.set("42", { ...mutation(), isPending: true });
    setup();
    const first = screen.getByRole("article", { name: "Database design" });
    const second = screen.getByRole("article", { name: "Search design" });
    expect(
      within(first).getByRole("button", { name: "Retry this task" }),
    ).toBeDisabled();
    expect(
      within(second).getByRole("button", { name: "Retry this task" }),
    ).toBeEnabled();
    const controls = within(second).getByTestId("task-controls");
    expect(controls).toHaveClass("flex-wrap");
    expect(
      within(second).getByRole("button", { name: "Retry this task" }),
    ).toHaveClass("min-h-11", "sm:min-h-8");
    expect(second).toHaveClass("min-w-0");
  });
  it("loads bounded attempt history on demand and preserves exact batch and execution identities", () => {
    const more = vi.fn();
    vi.mocked(useSecretaryTaskDetail).mockReturnValue({
      data: {
        pages: [
          {
            task,
            attempts: [
              {
                attempt_id: "older",
                batch_id: "old-batch",
                state: "failed",
                not_dispatched: true,
                has_output: false,
                error_code: "connection_backoff",
              },
              {
                attempt_id: "published",
                batch_id: "published-batch",
                state: "committed",
                not_dispatched: false,
                has_output: true,
              },
            ],
          },
        ],
      },
      isPending: false,
      isError: false,
      error: null,
      isFetching: false,
      isFetchingNextPage: false,
      hasNextPage: true,
      restart: vi.fn(),
      fetchNextPage: more,
    } as unknown as ReturnType<typeof useSecretaryTaskDetail>);
    setup();
    const row = screen.getByRole("article", { name: "Database design" });
    fireEvent.click(within(row).getByRole("button", { name: "Task details" }));
    expect(row).toHaveTextContent("old-batch");
    expect(row).toHaveTextContent("Not dispatched");
    expect(row).toHaveTextContent("Published");
    expect(row).not.toHaveTextContent("Secretary will retry automatically");
    fireEvent.click(within(row).getByRole("button", { name: "More attempts" }));
    expect(more).toHaveBeenCalledOnce();
  });
  it.each([
    ["recovered", "Existing result recovered"],
    ["still_unknown", "still unknown"],
    ["result_invalid", "could not be published"],
    ["result_failed", "confirmed as failed"],
    [
      "resumed",
      "Unconfirmed executions still require a result check or an explicit retry",
    ],
  ])("explains the %s check outcome safely", (outcome, text) => {
    actions.set("42", { ...mutation(), isSuccess: true, data: { outcome } });
    setup();
    expect(
      screen.getByRole("article", { name: "Database design" }),
    ).toHaveTextContent(text);
  });
  it("shows conflict reconciliation and hides denied cached task metadata", () => {
    actions.set("42", {
      ...mutation(),
      isError: true,
      error: new ApiError("private error", 409, null),
    });
    const view = setup();
    expect(screen.getByText(/Task changed/)).toBeInTheDocument();
    const denied = { ...query(), isError: true, error: new AuthError() };
    vi.mocked(useSecretaryTasks).mockReturnValue(
      denied as unknown as ReturnType<typeof useSecretaryTasks>,
    );
    view.rerender(
      <TooltipProvider>
        <SecretaryTaskList userId="owner" enabled />
      </TooltipProvider>,
    );
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });
  it("keeps the recovered result notice when the completed task leaves the pending list", () => {
    let notify: Parameters<typeof useSecretaryTaskAction>[2];
    vi.mocked(useSecretaryTaskAction).mockImplementation(
      (_user, id, onResult) => {
        if (id === "42") notify = onResult;
        return mutation() as unknown as ReturnType<
          typeof useSecretaryTaskAction
        >;
      },
    );
    const view = setup();
    act(() =>
      notify?.({
        task: { ...task, execution_state: "completed" },
        outcome: "recovered",
      }),
    );
    const empty = query();
    empty.data.pages[0].items = [];
    vi.mocked(useSecretaryTasks).mockReturnValue(
      empty as unknown as ReturnType<typeof useSecretaryTasks>,
    );
    view.rerender(
      <TooltipProvider>
        <SecretaryTaskList userId="owner" enabled />
      </TooltipProvider>,
    );
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Existing result recovered and published",
    );
  });
  it("shows both the execution outcome and its future-retry pause", () => {
    const paused = query();
    paused.data.pages[0].items = [{ ...task, paused: true }];
    vi.mocked(useSecretaryTasks).mockReturnValue(
      paused as unknown as ReturnType<typeof useSecretaryTasks>,
    );
    setup();
    expect(screen.getByRole("article")).toHaveTextContent("Outcome unknown");
    expect(screen.getByRole("article")).toHaveTextContent("Paused");
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(actions.get("42")!.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ action: "resume" }),
    );
  });
  it.each([
    ["waiting_retry", false, true],
    ["waiting_retry", true, false],
    ["unknown", false, false],
    ["blocked", false, false],
  ] as const)(
    "shows a next-retry time only for unpaused connection waiting (%s/%s)",
    (state, paused, visible) => {
      const data = query();
      data.data.pages[0].items = [
        {
          ...task,
          execution_state: state,
          paused,
          next_retry_at: "2026-11-04T23:59:00Z",
          error_code: "connection_backoff",
        },
      ];
      vi.mocked(useSecretaryTasks).mockReturnValue(
        data as unknown as ReturnType<typeof useSecretaryTasks>,
      );
      setup();
      if (visible)
        expect(screen.getByRole("article")).toHaveTextContent("Next retry");
      else
        expect(screen.getByRole("article")).not.toHaveTextContent("Next retry");
      if (paused)
        expect(screen.getByRole("article")).not.toHaveTextContent(
          "Secretary will retry automatically",
        );
    },
  );
  it("explains a source that has not finished without showing an execution failure", () => {
    const data = query();
    data.data.pages[0].items = [
      {
        ...task,
        execution_state: "waiting_source",
        error_code: "source_incomplete",
      },
    ];
    vi.mocked(useSecretaryTasks).mockReturnValue(
      data as unknown as ReturnType<typeof useSecretaryTasks>,
    );
    setup();
    expect(screen.getByRole("article")).toHaveTextContent(
      "Waiting for the source turn to finish.",
    );
    expect(screen.getByRole("article")).not.toHaveTextContent(
      "Model connection failed",
    );
  });
  it.each([404, 503])(
    "handles HTTP %s after loading warm task detail without confusing transient errors with revocation",
    (status) => {
      const warm = {
        data: {
          pages: [
            {
              task: { ...task, title: "Cached private title" },
              attempts: [
                {
                  attempt_id: "cached-private-attempt",
                  batch_id: "cached-private-batch",
                  state: "unknown",
                  not_dispatched: false,
                  has_output: false,
                },
              ],
            },
          ],
        },
        isPending: false,
        isError: false,
        error: null as Error | null,
        isFetching: false,
        isFetchingNextPage: false,
        hasNextPage: false,
        restart: vi.fn(),
        fetchNextPage: vi.fn(),
      };
      vi.mocked(useSecretaryTaskDetail).mockReturnValue(
        warm as unknown as ReturnType<typeof useSecretaryTaskDetail>,
      );
      const view = setup();
      fireEvent.click(
        within(
          screen.getByRole("article", { name: "Database design" }),
        ).getByRole("button", { name: "Task details" }),
      );
      expect(screen.getByText("cached-private-attempt")).toBeInTheDocument();
      vi.mocked(useSecretaryTaskDetail).mockReturnValue({
        ...warm,
        isError: true,
        error: new ApiError("raw private failure", status, null),
      } as unknown as ReturnType<typeof useSecretaryTaskDetail>);
      view.rerender(
        <TooltipProvider>
          <SecretaryTaskList userId="owner" enabled />
        </TooltipProvider>,
      );
      if (status === 404) {
        expect(
          screen.queryByText("cached-private-attempt"),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByText("cached-private-batch"),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByText("Cached private title"),
        ).not.toBeInTheDocument();
        expect(screen.queryByText("Database design")).not.toBeInTheDocument();
        expect(
          screen.getByRole("article", { name: "Unavailable task" }),
        ).toHaveTextContent("This task is no longer available");
      } else {
        expect(screen.getByText("cached-private-attempt")).toBeInTheDocument();
        expect(
          screen.getByRole("article", { name: "Database design" }),
        ).toHaveTextContent("Attempt history is unavailable");
      }
    },
  );
  it("removes stale action and execution controls after a warm detail becomes unavailable", () => {
    const state = query();
    vi.mocked(useSecretaryTasks).mockReturnValue(
      state as unknown as ReturnType<typeof useSecretaryTasks>,
    );
    const warm = {
      data: { pages: [{ task, attempts: [] }] },
      isPending: false,
      isError: false,
      error: null as Error | null,
      isFetching: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      restart: vi.fn(),
      fetchNextPage: vi.fn(),
    };
    vi.mocked(useSecretaryTaskDetail).mockReturnValue(
      warm as unknown as ReturnType<typeof useSecretaryTaskDetail>,
    );
    const view = setup();
    const row = screen.getByRole("article", { name: "Database design" });
    fireEvent.click(within(row).getByRole("button", { name: "Task details" }));
    fireEvent.click(
      within(row).getByRole("button", { name: "Retry this task" }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    vi.mocked(useSecretaryTaskDetail).mockReturnValue({
      ...warm,
      isError: true,
      error: new ApiError("gone", 404, null),
    } as unknown as ReturnType<typeof useSecretaryTaskDetail>);
    view.rerender(
      <TooltipProvider>
        <SecretaryTaskList userId="owner" enabled />
      </TooltipProvider>,
    );
    const unavailable = screen.getByRole("article", {
      name: "Unavailable task",
    });
    expect(within(unavailable).queryByRole("link")).not.toBeInTheDocument();
    expect(
      within(unavailable).queryByRole("button", { name: "Retry this task" }),
    ).not.toBeInTheDocument();
    expect(
      within(unavailable).queryByRole("button", {
        name: "Check existing result",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(unavailable).queryByRole("button", {
        name: "Pause future retries",
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(
      within(unavailable).getByRole("button", { name: "Refresh tasks" }),
    );
    expect(state.restart).toHaveBeenCalledOnce();
    expect(actions.get("42")!.mutate).not.toHaveBeenCalled();
  });
});
