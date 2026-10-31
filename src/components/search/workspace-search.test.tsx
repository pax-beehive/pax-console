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
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@/components/ui/tooltip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, AuthError } from "@/features/api/errors";
import {
  useWorkspaceSearch,
  useWorkspaceSource,
  WorkspaceMessageRead,
  WorkspaceReadRequest,
  WorkspaceSearchHit,
  WorkspaceSummaryVersion,
} from "@/features/api/workspace-search";
import { WorkspaceSearch } from "./workspace-search";
import { LiteralHighlight } from "./literal-highlight";

vi.mock("@/features/api/workspace-search", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useWorkspaceSearch: vi.fn(),
  useWorkspaceSource: vi.fn(),
}));

const render = (ui: ReactElement) =>
  rtlRender(ui, { wrapper: TooltipProvider });

const messageRef = {
  kind: "message" as const,
  id: "msg_123",
  content_hash: "sha256:old",
  canonicalization_version: "visible-text-v1",
};
const messageHit: WorkspaceSearchHit = {
  ref: messageRef,
  title: "Database choice",
  snippet: "We chose 数据库",
  session_id: "sess_1",
};
const message: WorkspaceMessageRead = {
  ref: messageRef,
  message_id: "msg_123",
  agent_id: "agent_1",
  session_id: "sess_1",
  role: "assistant",
  session_seq: 4,
  created_at: "2026-10-31T12:00:00Z",
  text: "We chose 数据库",
  view: "last",
  available_views: ["first", "last", "full"],
  has_more: false,
  read_receipt: "receipt",
};
const summary: WorkspaceSummaryVersion = {
  summary_id: "summary_1",
  revision: 2,
  owner_user_id: "user_1",
  subject_type: "topic",
  subject_id: "topic_1",
  title: "Storage decisions",
  body: "Use PostgreSQL and Elasticsearch.",
  created_at: "2026-10-31T12:00:00Z",
  coverage: [
    {
      message_id: "msg_123",
      content_hash: "sha256:frozen",
      canonicalization_version: "visible-text-v1",
    },
  ],
  claims: [
    {
      id: "claim_1",
      text: "Elasticsearch handles search",
      evidence: [
        {
          message: {
            message_id: "msg_123",
            content_hash: "sha256:frozen",
            canonicalization_version: "visible-text-v1",
          },
          quote: "We chose ES",
        },
      ],
    },
  ],
  summary_sources: [{ summary_id: "summary_child", revision: 3 }],
};

function queryState(hits: WorkspaceSearchHit[] = [messageHit]) {
  return {
    data: { pages: [{ hits }], pageParams: [undefined] },
    isPending: false,
    isError: false,
    error: null as Error | null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    restart: vi.fn(),
    refetch: vi.fn(),
  };
}
function sourceState(data: unknown = message) {
  return {
    data,
    isPending: false,
    isError: false,
    error: null as Error | null,
    refetch: vi.fn(),
  };
}
function searchResult(state: ReturnType<typeof queryState>) {
  vi.mocked(useWorkspaceSearch).mockReturnValue(
    state as unknown as ReturnType<typeof useWorkspaceSearch>,
  );
}
function sourceResult(state: ReturnType<typeof sourceState>) {
  vi.mocked(useWorkspaceSource).mockReturnValue(
    state as unknown as ReturnType<typeof useWorkspaceSource>,
  );
}
function setup(props: Partial<Parameters<typeof WorkspaceSearch>[0]> = {}) {
  const onNavigate = vi.fn();
  return {
    onNavigate,
    ...render(
      <WorkspaceSearch
        userId="user_1"
        query="数据"
        kind="all"
        onNavigate={onNavigate}
        {...props}
      />,
    ),
  };
}
function openMessage() {
  fireEvent.click(screen.getByRole("button", { name: /Database choice/ }));
}
function latestRead(): WorkspaceReadRequest | undefined {
  return vi.mocked(useWorkspaceSource).mock.calls.at(-1)?.[1];
}

beforeEach(() => {
  vi.clearAllMocks();
  searchResult(queryState());
  sourceResult(sourceState());
});
afterEach(cleanup);

describe("Workspace search", () => {
  it("supports submitting and opening a result using the keyboard", async () => {
    const user = userEvent.setup();
    const { onNavigate } = setup();
    const input = screen.getByRole("searchbox", {
      name: "Search your workspace",
    });
    await user.clear(input);
    await user.type(input, "database{Enter}");
    expect(onNavigate).toHaveBeenCalledWith("/search?q=database");
    screen.getByRole("button", { name: /Database choice/ }).focus();
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("region", { name: "Selected source" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Database choice" }),
    ).toHaveFocus();
  });

  it("refreshes the same query without retaining expired pagination", () => {
    const state = queryState();
    searchResult(state);
    const { onNavigate } = setup();
    fireEvent.submit(screen.getByRole("form", { name: "Workspace search" }));
    expect(state.restart).toHaveBeenCalledOnce();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("submits literal queries through the URL and changes kind filters", () => {
    const { onNavigate } = setup();
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search your workspace" }),
      { target: { value: "苹果 & 笔记本" } },
    );
    fireEvent.submit(screen.getByRole("form", { name: "Workspace search" }));
    expect(onNavigate).toHaveBeenCalledWith(
      "/search?q=%E8%8B%B9%E6%9E%9C+%26+%E7%AC%94%E8%AE%B0%E6%9C%AC",
    );
    fireEvent.click(screen.getByRole("button", { name: "Summaries" }));
    expect(onNavigate).toHaveBeenLastCalledWith(
      "/search?q=%E6%95%B0%E6%8D%AE&kind=summary",
    );
  });

  it("has an initial state and disables blank submissions", () => {
    setup({ query: "" });
    expect(
      screen.getByText(
        "Enter a word or phrase to find its exact text in your content.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
    expect(useWorkspaceSearch).toHaveBeenLastCalledWith("user_1", {
      query: "",
      kinds: undefined,
      limit: 20,
    });
  });

  it("shows loading and an empty state, and bounds too-long URL queries", () => {
    searchResult({ ...queryState(), isPending: true });
    const view = setup();
    expect(screen.getByRole("status")).toHaveTextContent("Searching");
    searchResult(queryState([]));
    view.rerender(
      <WorkspaceSearch
        userId="user_1"
        query="nothing"
        kind="all"
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByText("No results")).toBeInTheDocument();
    view.rerender(
      <WorkspaceSearch
        userId="user_1"
        query={"a".repeat(257)}
        kind="all"
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByText("Search phrase is too long")).toBeInTheDocument();
    expect(useWorkspaceSearch).toHaveBeenLastCalledWith(
      "user_1",
      expect.objectContaining({ query: "" }),
    );
  });

  it("loads additional pages without dropping existing hits", () => {
    const state = { ...queryState(), hasNextPage: true };
    searchResult(state);
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(state.fetchNextPage).toHaveBeenCalledOnce();
    expect(screen.getByText("Database choice")).toBeInTheDocument();
  });

  it("deduplicates overlapping pages and restarts expired cursors", () => {
    const state = {
      ...queryState(),
      isError: true,
      error: new ApiError("invalid cursor", 400, {}),
      data: {
        pages: [{ hits: [messageHit, messageHit] }],
        pageParams: [undefined],
      },
    };
    searchResult(state);
    setup();
    expect(screen.getAllByText("Database choice")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("results have expired");
    fireEvent.click(screen.getByRole("button", { name: "Restart search" }));
    expect(state.restart).toHaveBeenCalledOnce();
  });

  it("retries unavailable search and disables pending pagination", () => {
    const state = {
      ...queryState([]),
      isError: true,
      error: new ApiError("offline", 503, {}),
    };
    searchResult(state);
    const view = setup();
    fireEvent.click(screen.getByRole("button", { name: "Retry search" }));
    expect(state.restart).toHaveBeenCalledOnce();
    searchResult({
      ...queryState(),
      hasNextPage: true,
      isFetchingNextPage: true,
    });
    view.rerender(
      <WorkspaceSearch
        userId="user_1"
        query="数据"
        kind="all"
        onNavigate={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Loading more…" }),
    ).toBeDisabled();
  });

  it("hides cached results and the selected source when access expires", () => {
    const view = setup();
    openMessage();
    searchResult({ ...queryState(), isError: true, error: new AuthError() });
    view.rerender(
      <WorkspaceSearch
        userId="user_1"
        query="数据"
        kind="all"
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.queryByText("Database choice")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Selected source" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Your session expired");
    expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute(
      "href",
      "/auth/login",
    );
  });

  it("reads the exact selected version and opens its canonical session", () => {
    setup();
    openMessage();
    expect(latestRead()).toEqual({
      ref: messageRef,
      limit: 4096,
      before: 3,
      after: 3,
    });
    expect(
      screen.getByRole("article", { name: "Message text" }),
    ).toHaveTextContent("We chose 数据库");
    expect(screen.getByRole("link", { name: "Open session" })).toHaveAttribute(
      "href",
      "/?session_id=sess_1",
    );
    fireEvent.click(screen.getByRole("button", { name: "Full message" }));
    expect(latestRead()).toEqual(
      expect.objectContaining({ ref: messageRef, view: "full", offset: 0 }),
    );
    fireEvent.click(screen.getByRole("button", { name: "First paragraph" }));
    expect(latestRead()).toEqual(
      expect.objectContaining({ ref: messageRef, view: "first", offset: 0 }),
    );
  });

  it("paginates using the returned full-body version and tracks previous offsets", () => {
    sourceResult(
      sourceState({
        ...message,
        view: "full",
        has_more: true,
        next_offset: 4096,
      }),
    );
    setup();
    openMessage();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(latestRead()).toEqual(
      expect.objectContaining({
        ref: messageRef,
        view: "full",
        offset: 4096,
        limit: 4096,
      }),
    );
    expect(screen.getByText("Page 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(latestRead()).toEqual(
      expect.objectContaining({ ref: messageRef, offset: 0 }),
    );
  });

  it("links context by its exact reference", () => {
    const context = {
      ...message,
      message_id: "msg_before",
      ref: { ...messageRef, id: "msg_before" },
      session_seq: 3,
      text: "Earlier question",
    };
    sourceResult(sourceState({ ...message, context: [context] }));
    setup();
    openMessage();
    expect(
      screen.getByRole("article", { name: "Context message" }),
    ).toHaveTextContent("Earlier question");
    fireEvent.click(screen.getByRole("button", { name: "Read message" }));
    expect(latestRead()?.ref).toEqual(context.ref);
  });

  it("shows summary claims and follows frozen message and child summary references", () => {
    searchResult(
      queryState([
        {
          ref: { kind: "summary", id: "summary_1", revision: 2 },
          title: summary.title,
          snippet: summary.body,
        },
      ]),
    );
    sourceResult(sourceState(summary));
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Storage decisions/ }));
    expect(latestRead()?.ref).toEqual({
      kind: "summary",
      id: "summary_1",
      revision: 2,
    });
    expect(
      screen.getByRole("region", { name: "Summary claims" }),
    ).toHaveTextContent("Elasticsearch handles search");
    expect(screen.getByText("Version 2")).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole("region", { name: "Summary sources" })).getByRole(
        "button",
        { name: "msg_123" },
      ),
    );
    expect(latestRead()?.ref).toEqual({
      ...messageRef,
      content_hash: "sha256:frozen",
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Open summary summary_child, version 3",
      }),
    );
    expect(latestRead()?.ref).toEqual({
      kind: "summary",
      id: "summary_child",
      revision: 3,
    });
  });

  it("does not silently replace a missing version with current content", () => {
    sourceResult({
      ...sourceState(undefined),
      isError: true,
      error: new ApiError("source version unavailable", 409, {}),
    });
    setup();
    openMessage();
    expect(latestRead()?.ref).toEqual(messageRef);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This version is no longer available",
    );
    expect(
      screen.queryByRole("article", { name: "Message text" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Load current version" }),
    );
    expect(latestRead()?.ref).toEqual({ kind: "message", id: "msg_123" });
  });

  it("handles source loading, unavailable content, and retry", () => {
    sourceResult({ ...sourceState(undefined), isPending: true });
    const view = setup();
    openMessage();
    expect(screen.getByRole("status")).toHaveTextContent("Loading source");
    const state = {
      ...sourceState(undefined),
      isError: true,
      error: new ApiError("offline", 503, {}),
    };
    sourceResult(state);
    view.rerender(
      <WorkspaceSearch
        userId="user_1"
        query="数据"
        kind="all"
        onNavigate={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry source" }));
    expect(state.refetch).toHaveBeenCalledOnce();
    sourceResult({ ...state, error: new ApiError("not found", 404, {}) });
    view.rerender(
      <WorkspaceSearch
        userId="user_1"
        query="数据"
        kind="all"
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "no longer available to you",
    );
    expect(
      screen.queryByRole("button", { name: "Load current version" }),
    ).not.toBeInTheDocument();
  });

  it("clears selected sources on query or user change and supports returning on mobile", () => {
    const view = setup();
    openMessage();
    const results = screen.getByRole("region", { name: "Search results" });
    expect(results).toHaveClass("hidden", "md:flex");
    fireEvent.click(screen.getByRole("button", { name: "Back to results" }));
    expect(
      screen.queryByRole("region", { name: "Selected source" }),
    ).not.toBeInTheDocument();
    openMessage();
    fireEvent.keyDown(screen.getByRole("region", { name: "Selected source" }), {
      key: "Escape",
    });
    expect(
      screen.queryByRole("region", { name: "Selected source" }),
    ).not.toBeInTheDocument();
    openMessage();
    view.rerender(
      <WorkspaceSearch
        userId="user_2"
        query="数据"
        kind="all"
        onNavigate={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("region", { name: "Selected source" }),
    ).not.toBeInTheDocument();
    expect(useWorkspaceSearch).toHaveBeenLastCalledWith(
      "user_2",
      expect.anything(),
    );
    openMessage();
    view.rerender(
      <WorkspaceSearch
        userId="user_2"
        query="new query"
        kind="all"
        onNavigate={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("region", { name: "Selected source" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveValue("new query");
  });

  it("holds the selected version when refreshed results contain a newer message", () => {
    const view = setup();
    openMessage();
    searchResult(
      queryState([
        { ...messageHit, ref: { ...messageRef, content_hash: "sha256:new" } },
      ]),
    );
    view.rerender(
      <WorkspaceSearch
        userId="user_1"
        query="数据"
        kind="all"
        onNavigate={vi.fn()}
      />,
    );
    expect(latestRead()?.ref).toEqual(messageRef);
  });

  it("opens title hits through a source read without inventing a message ID", () => {
    searchResult(
      queryState([
        {
          ref: { kind: "session", id: "42" },
          title: "Release plan",
          snippet: "Release plan",
        },
      ]),
    );
    sourceResult(
      sourceState({
        kind: "session",
        source_id: "42",
        title: "Release plan",
        session_id: "sess_release",
        revision: 7,
        created_at: "2026-10-31T12:00:00Z",
        deleted: false,
      }),
    );
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Release plan/ }));
    expect(latestRead()?.ref).toEqual({ kind: "session", id: "42" });
    expect(screen.getByRole("link", { name: "Open session" })).toHaveAttribute(
      "href",
      "/?session_id=sess_release",
    );
  });
});

describe("Literal highlighting", () => {
  it("keeps text intact when lowercase Unicode has a different length", () => {
    const { container } = render(
      <LiteralHighlight text="İstanbul DATA 数据" query="data" />,
    );
    expect(container.querySelector("mark")).toHaveTextContent("DATA");
    expect(container.textContent).toBe("İstanbul DATA 数据");
  });
  it("highlights repeated case-insensitive literal matches and escapes HTML", () => {
    const { container } = render(
      <LiteralHighlight
        text={"<img src=x onerror=alert(1)> [a.*] then [A.*]"}
        query="[a.*]"
      />,
    );
    expect(container.querySelectorAll("mark")).toHaveLength(2);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe(
      "<img src=x onerror=alert(1)> [a.*] then [A.*]",
    );
  });
  it("matches a Chinese character across assembled message text", () => {
    const { container } = render(
      <LiteralHighlight text="苹果笔记本" query="本" />,
    );
    expect(container.querySelector("mark")).toHaveTextContent("本");
    expect(container.textContent).toBe("苹果笔记本");
  });
});
