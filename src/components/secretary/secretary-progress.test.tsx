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
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError, AuthError } from "@/features/api/errors";
import {
  SecretaryProgressPage,
  useSecretaryProgress,
} from "@/features/api/secretary-progress";
import {
  SecretaryProgressOverview,
  SecretarySessionProgressList,
} from "./secretary-progress";

const render = (ui: ReactElement) =>
  rtlRender(ui, { wrapper: TooltipProvider });
const page: SecretaryProgressPage = {
  as_of: "2026-10-31T12:00:00Z",
  counts: {
    total_sessions: 42,
    completed_sessions: 10,
    partial_sessions: 12,
    unstarted_sessions: 20,
    total_messages: 100,
    completed_messages: 40,
    pending_messages: 60,
    total_turns: 50,
    completed_turns: 20,
    pending_turns: 30,
    ungrouped_messages: 0,
  },
  sessions: [
    {
      source_id: "1",
      agent_id: "agent_1",
      session_id: "session_1",
      title: "Database design",
      state: "partial",
      total_messages: 10,
      completed_messages: 4,
      pending_messages: 6,
      total_turns: 5,
      completed_turns: 2,
      pending_turns: 3,
      ungrouped_messages: 0,
    },
  ],
};
function query(overrides: Record<string, unknown> = {}) {
  return {
    data: { pages: [page] },
    isPending: false,
    isError: false,
    error: null,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    restart: vi.fn(),
    fetchNextPage: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useSecretaryProgress>;
}
afterEach(cleanup);
describe("Secretary progress", () => {
  it("shows authoritative aggregate counts rather than the number of loaded rows", () => {
    render(<SecretaryProgressOverview progress={query()} />);
    const panel = screen.getByRole("region", { name: "Summary progress" });
    expect(panel).toHaveTextContent("Sessions tracked42");
    expect(panel).toHaveTextContent("Up to date10");
    expect(panel).toHaveTextContent("Partly summarized12");
    expect(panel).toHaveTextContent("Awaiting summary20");
    expect(panel).toHaveTextContent("20 of 50 turns summarized · 30 remaining");
    expect(panel).toHaveTextContent("Only published summaries count");
    expect(screen.getByRole("link", { name: "View sessions" })).toHaveAttribute(
      "href",
      "#secretary-session-progress",
    );
    expect(panel.textContent).not.toContain("%");
  });
  it("shows exact turn progress and source session identity for partial sessions", () => {
    render(
      <SecretarySessionProgressList
        progress={query()}
        agents={[{ agent_id: "agent_1", name: "Work agent" }]}
      />,
    );
    expect(
      screen.getByText("2 of 5 turns summarized · 3 remaining"),
    ).toBeInTheDocument();
    expect(screen.getByText("Partly summarized")).toBeInTheDocument();
    expect(screen.getByText("Work agent")).toBeInTheDocument();
    expect(screen.getByText("session_1")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Database design" }),
    ).toHaveAttribute("href", "/?session_id=session_1");
    expect(screen.getByText("Showing 1 of 42 sessions")).toBeInTheDocument();
  });
  it("falls back to message counts whenever turn grouping is incomplete", () => {
    render(
      <SecretarySessionProgressList
        progress={query({
          data: {
            pages: [
              {
                ...page,
                sessions: [{ ...page.sessions[0], ungrouped_messages: 1 }],
              },
            ],
          },
        })}
        agents={[]}
      />,
    );
    expect(
      screen.getByText("4 of 10 messages summarized · 6 remaining"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("2 of 5 turns summarized · 3 remaining"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Where turn counts aren’t available/),
    ).toBeInTheDocument();
  });
  it("replaces duplicate source rows with the newer page data", () => {
    render(
      <SecretarySessionProgressList
        progress={query({
          data: {
            pages: [
              page,
              {
                ...page,
                sessions: [
                  {
                    ...page.sessions[0],
                    title: "Updated design",
                    completed_turns: 3,
                    pending_turns: 2,
                  },
                ],
              },
            ],
          },
        })}
        agents={[]}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(
      screen.getByText("3 of 5 turns summarized · 2 remaining"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Database design")).not.toBeInTheDocument();
  });
  it("allows remaining counts to rise after new messages without pretending a model percentage", () => {
    const view = render(<SecretaryProgressOverview progress={query()} />);
    const updated = {
      ...page,
      counts: {
        ...page.counts,
        completed_sessions: 9,
        partial_sessions: 13,
        total_turns: 60,
        pending_turns: 40,
      },
    };
    view.rerender(
      <SecretaryProgressOverview
        progress={query({ data: { pages: [updated] } })}
      />,
    );
    expect(
      screen.getByText("20 of 60 turns summarized · 40 remaining"),
    ).toBeInTheDocument();
    expect(screen.getByRole("region").textContent).not.toContain("%");
  });
  it("keeps zero published coverage unstarted even when work could be in progress", () => {
    render(
      <SecretarySessionProgressList
        progress={query({
          data: {
            pages: [
              {
                ...page,
                sessions: [
                  {
                    ...page.sessions[0],
                    state: "unstarted",
                    completed_messages: 0,
                    pending_messages: 10,
                    completed_turns: 0,
                    pending_turns: 5,
                  },
                ],
              },
            ],
          },
        })}
        agents={[]}
      />,
    );
    expect(screen.getByText("Awaiting summary")).toBeInTheDocument();
    expect(
      screen.getByText("0 of 5 turns summarized · 5 remaining"),
    ).toBeInTheDocument();
  });
  it("shows loading and missing-backend errors with an explicit refresh", () => {
    const state = query({ data: undefined, isPending: true });
    const view = render(<SecretaryProgressOverview progress={state} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading summary progress",
    );
    const failed = query({
      data: undefined,
      isError: true,
      error: new ApiError("missing", 404, {}),
    });
    view.rerender(<SecretaryProgressOverview progress={failed} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Summary progress is unavailable",
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh progress" }));
    expect(failed.restart).toHaveBeenCalledOnce();
  });
  it("hides cached progress after authentication expires", () => {
    const state = query({ isError: true, error: new AuthError() });
    render(
      <>
        <SecretaryProgressOverview progress={state} />
        <SecretarySessionProgressList progress={state} agents={[]} />
      </>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Sign in again");
    expect(screen.queryByText("Database design")).not.toBeInTheDocument();
  });
  it("loads more pages and supports restarting an expired cursor", () => {
    const state = query({ hasNextPage: true });
    const view = render(
      <SecretarySessionProgressList progress={state} agents={[]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more sessions" }));
    expect(state.fetchNextPage).toHaveBeenCalledOnce();
    const failed = query({
      isError: true,
      error: new ApiError("invalid cursor", 400, {}),
    });
    view.rerender(
      <SecretarySessionProgressList progress={failed} agents={[]} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The session list changed",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry progress" }));
    expect(failed.restart).toHaveBeenCalledOnce();
  });
  it("shows a true empty eligible universe without inventing zero progress for unread sessions", () => {
    const empty = {
      ...page,
      counts: {
        ...page.counts,
        total_sessions: 0,
        completed_sessions: 0,
        partial_sessions: 0,
        unstarted_sessions: 0,
      },
      sessions: [],
    };
    render(
      <SecretarySessionProgressList
        progress={query({ data: { pages: [empty] } })}
        agents={[]}
      />,
    );
    expect(
      screen.getByText("No sessions with readable messages yet."),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("list")).queryAllByRole("listitem"),
    ).toHaveLength(0);
  });
});
