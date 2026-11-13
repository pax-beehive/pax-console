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
import { useLocaleStore } from "@/features/i18n/locale-store";
import { ApiError, AuthError } from "@/features/api/errors";
import {
  useWorkspaceSource,
  WorkspaceMessageRead,
  WorkspaceReadRequest,
  WorkspaceSearchHit,
  WorkspaceSummaryVersion,
} from "@/features/api/workspace-search";
import {
  useWorkspaceGroupMatches,
  WorkspaceSearchGroup,
} from "@/features/api/workspace-search-groups";
import { useWorkspaceSearchResults } from "@/features/api/workspace-search-results";
import { WorkspaceSearch } from "./workspace-search";
import { SearchSourcePanel } from "./search-source-panel";
import { LiteralHighlight } from "./literal-highlight";

vi.mock("@/features/api/workspace-search", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useWorkspaceSource: vi.fn(),
}));

vi.mock("@/features/api/workspace-search-groups", () => ({
  useWorkspaceGroupMatches: vi.fn(),
}));

vi.mock("@/features/api/workspace-search-results", () => ({
  useWorkspaceSearchResults: vi.fn(),
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

function groupFromHit(hit: WorkspaceSearchHit): WorkspaceSearchGroup {
  return {
    key: hit.ref.id,
    title: hit.title || "Untitled",
    session_id: hit.session_id,
    matches: [hit],
    matches_has_more: false,
  };
}
function queryState(hits: WorkspaceSearchHit[] = [messageHit]) {
  return {
    data: {
      pages: [{ groups: hits.map(groupFromHit) }] as {
        groups: WorkspaceSearchGroup[];
        pagination_limited?: boolean;
        mode?: "grouped" | "raw";
        hits?: WorkspaceSearchHit[];
      }[],
      pageParams: [undefined] as (string | undefined)[],
    },
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
  vi.mocked(useWorkspaceSearchResults).mockReturnValue(
    state as unknown as ReturnType<typeof useWorkspaceSearchResults>,
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
  fireEvent.click(
    screen.getByRole("button", {
      name: /Preview best match in Database choice/,
    }),
  );
}
function latestRead(): WorkspaceReadRequest | undefined {
  return vi.mocked(useWorkspaceSource).mock.calls.at(-1)?.[1];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  searchResult(queryState());
  sourceResult(sourceState());
  vi.mocked(useWorkspaceGroupMatches).mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    restart: vi.fn(),
  } as unknown as ReturnType<typeof useWorkspaceGroupMatches>);
});
afterEach(() => {
  cleanup();
  useLocaleStore.setState({ locale: "en" });
  vi.unstubAllGlobals();
});

describe("Workspace search", () => {
  it("uses the full result area until a source is selected and restores it on close", () => {
    setup();
    const results = screen.getByRole("region", { name: "Search results" });
    expect(results.parentElement?.children).toHaveLength(1);
    expect(
      screen.queryByText("Select a result to read its source."),
    ).not.toBeInTheDocument();
    openMessage();
    expect(results.parentElement?.children).toHaveLength(2);
    expect(
      screen.getByRole("region", { name: "Selected source" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close source" }));
    expect(results.parentElement?.children).toHaveLength(1);
    expect(
      screen.queryByRole("region", { name: "Selected source" }),
    ).not.toBeInTheDocument();
  });

  it("supports submitting and opening a result using the keyboard", async () => {
    const user = userEvent.setup();
    const { onNavigate } = setup();
    const input = screen.getByRole("searchbox", {
      name: "Search your workspace",
    });
    await user.clear(input);
    await user.type(input, "database{Enter}");
    expect(onNavigate).toHaveBeenCalledWith("/search?q=database");
    screen
      .getByRole("button", { name: /Preview best match in Database choice/ })
      .focus();
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("region", { name: "Selected source" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Selected source" })).getByRole(
        "heading",
        { name: "Database choice" },
      ),
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
        "Separate keywords with spaces. All-keyword results come first, followed by partial matches.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
    expect(useWorkspaceSearchResults).toHaveBeenLastCalledWith("user_1", {
      query: "",
      kinds: undefined,
      limit: 20,
    });
  });

  it("keeps multi-term input intact and explains ranked partial fallback and the backend term limit", () => {
    const query = "port\t数据库  PORT";
    setup({ query });
    expect(screen.getByRole("searchbox")).toHaveValue(query);
    expect(useWorkspaceSearchResults).toHaveBeenLastCalledWith(
      "user_1",
      expect.objectContaining({ query }),
    );
    expect(
      screen.getByText(/Results grouped by session. Best matches first/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Up to 16 distinct terms/)).toBeInTheDocument();
  });

  it("lets the backend validate distinct terms and provides useful input guidance on rejection", () => {
    const query = Array.from({ length: 17 }, (_, index) => `t${index}`).join(
      " ",
    );
    searchResult({
      ...queryState([]),
      isError: true,
      error: new ApiError("invalid query", 400, {}),
    });
    setup({ query });
    expect(useWorkspaceSearchResults).toHaveBeenLastCalledWith(
      "user_1",
      expect.objectContaining({ query }),
    );
    expect(screen.getByRole("button", { name: "Search" })).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Use up to 16 distinct terms and 256 characters.",
    );
  });

  it("renders the backend's partial matches without filtering them or issuing a second search", () => {
    searchResult(
      queryState([
        {
          ...messageHit,
          ref: { ...messageRef, id: "full" },
          title: "Full port 数据库",
        },
        {
          ...messageHit,
          ref: { ...messageRef, id: "partial" },
          title: "Partial port",
          snippet: "only port appears",
        },
      ]),
    );
    setup({ query: "数据库 port" });
    const partial = screen.getByRole("button", {
      name: /Preview best match in Partial port/,
    });
    expect(partial).toBeInTheDocument();
    expect(partial.querySelectorAll("mark")).toHaveLength(2);
    expect(
      screen.getByRole("button", {
        name: /Preview best match in Full port 数据库/,
      }),
    ).toBeInTheDocument();
    expect(useWorkspaceSearchResults).toHaveBeenCalledTimes(1);
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
    expect(useWorkspaceSearchResults).toHaveBeenLastCalledWith(
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
        pages: [
          { groups: [groupFromHit(messageHit), groupFromHit(messageHit)] },
        ],
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
    fireEvent.submit(screen.getByRole("form", { name: "Workspace search" }));
    searchResult({ ...queryState(), isPending: true });
    view.rerender(
      <WorkspaceSearch
        userId="user_1"
        query="数据"
        kind="all"
        onNavigate={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("region", { name: "Selected source" }),
    ).not.toBeInTheDocument();
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
      "/?session_id=sess_1&message_id=msg_123",
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
    fireEvent.click(
      screen.getByRole("button", {
        name: /Preview best match in Storage decisions/,
      }),
    );
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
    fireEvent.click(screen.getByRole("button", { name: "Back to summary" }));
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

  it("keeps normal search source dismissal available without an administrator denial callback", () => {
    sourceResult({
      ...sourceState(message),
      isError: true,
      error: new AuthError(),
    });
    const onClose = vi.fn();
    render(
      <SearchSourcePanel
        userId="user_1"
        sourceRef={messageRef}
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );
    expect(
      screen.queryByRole("article", { name: "Message text" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close source" }));
    expect(onClose).toHaveBeenCalledOnce();
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
    expect(useWorkspaceSearchResults).toHaveBeenLastCalledWith(
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
    fireEvent.click(
      screen.getByRole("button", {
        name: /Preview best match in Release plan/,
      }),
    );
    expect(latestRead()?.ref).toEqual({ kind: "session", id: "42" });
    expect(screen.getByRole("link", { name: "Open session" })).toHaveAttribute(
      "href",
      "/?session_id=sess_release",
    );
  });
});

describe("Session result groups", () => {
  const summaryHit: WorkspaceSearchHit = {
    ref: {
      kind: "summary",
      id: summary.summary_id,
      revision: summary.revision,
    },
    title: summary.title,
    snippet: summary.body,
    session_id: "sess_1",
  };
  const sessionHit: WorkspaceSearchHit = {
    ref: { kind: "session", id: "42" },
    title: "My storage session",
    snippet: "My storage session",
    session_id: "sess_1",
  };
  const sessionGroup: WorkspaceSearchGroup = {
    key: "opaque_session_group",
    title: "My storage session",
    session_id: "sess_1",
    matches: [summaryHit, messageHit, sessionHit],
    matches_has_more: false,
  };
  function groupedResult(groups: WorkspaceSearchGroup[] = [sessionGroup]) {
    searchResult({
      ...queryState(),
      data: { pages: [{ groups }], pageParams: [undefined] },
    });
  }
  function extraResult(overrides: Record<string, unknown>) {
    vi.mocked(useWorkspaceGroupMatches).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      restart: vi.fn(),
      ...overrides,
    } as unknown as ReturnType<typeof useWorkspaceGroupMatches>);
  }
  function expand() {
    fireEvent.click(
      screen.getByRole("button", {
        name: "Show matches in My storage session",
      }),
    );
  }
  function readVersions() {
    vi.mocked(useWorkspaceSource).mockImplementation(
      (_userId, request) =>
        sourceState(
          request?.ref.kind === "summary"
            ? summary
            : {
                ...message,
                ref: request?.ref ?? messageRef,
              },
        ) as unknown as ReturnType<typeof useWorkspaceSource>,
    );
  }

  it("uses the canonical session title and the best snippet in one compact result", () => {
    groupedResult();
    setup();
    const card = screen.getByRole("article", { name: "My storage session" });
    expect(screen.getByText("1 result")).toBeInTheDocument();
    expect(within(card).getByRole("heading")).toHaveTextContent(
      "My storage session",
    );
    expect(within(card).getByRole("heading")).toHaveClass("truncate");
    expect(within(card).getByText(summary.body, { selector: "p" })).toHaveClass(
      "line-clamp-2",
    );
    expect(within(card).queryByText(summary.title)).not.toBeInTheDocument();
    expect(within(card).queryByText("sess_1")).not.toBeInTheDocument();
    expect(
      within(card).getByRole("button", { name: /Show matches/ }),
    ).toHaveTextContent("3");
    expect(useWorkspaceGroupMatches).toHaveBeenLastCalledWith(
      "user_1",
      expect.objectContaining({ query: "数据", limit: 20 }),
      sessionGroup.key,
      false,
    );
  });

  it("expands independently and shows one-line labeled content without opening a source", () => {
    groupedResult();
    setup();
    expand();
    expect(
      screen.queryByRole("region", { name: "Selected source" }),
    ).not.toBeInTheDocument();
    const rows = screen.getAllByRole("button", {
      name: /^Preview (summary|message|title):/,
    });
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent(`Summary${summary.body}`);
    expect(rows[0].querySelector(".flex-1")).toHaveClass("truncate");
    expect(rows[0].querySelector(".bg-surface-2")).toHaveClass(
      "font-medium",
      "shrink-0",
    );
    expect(
      screen.queryByRole("button", { name: /Load more matches/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Hide matches/ }),
    ).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(rows[1]);
    expect(latestRead()?.ref).toEqual(messageRef);
  });

  it("keeps multiple independent summary hits in one origin session group", () => {
    const second = {
      ...summaryHit,
      ref: { kind: "summary" as const, id: "summary_2", revision: 1 },
      snippet: "Deployment and search indexing",
    };
    groupedResult([
      { ...sessionGroup, matches: [summaryHit, second, messageHit] },
    ]);
    readVersions();
    setup();
    expand();
    expect(
      screen.getAllByRole("article", { name: "My storage session" }),
    ).toHaveLength(1);
    const rows = screen.getAllByRole("button", { name: /^Preview summary:/ });
    expect(rows).toHaveLength(2);
    fireEvent.click(rows[1]);
    expect(latestRead()?.ref).toEqual(second.ref);
  });

  it("returns from frozen evidence to the same summary and result expansion without losing scroll", () => {
    groupedResult();
    readVersions();
    setup();
    expand();
    const results = screen.getByRole("region", { name: "Search results" });
    results.scrollTop = 170;
    fireEvent.click(screen.getByRole("button", { name: /^Preview summary:/ }));
    const summaryArticle = screen.getByRole("article", {
      name: "Summary text",
    });
    const summaryScroll = summaryArticle.closest(
      ".overflow-y-auto",
    ) as HTMLElement;
    summaryScroll.scrollTop = 210;
    expect(
      screen.getByRole("form", { name: "Workspace search" }).parentElement,
    ).toHaveClass("hidden", "md:block");
    fireEvent.click(screen.getByRole("button", { name: "Read evidence" }));
    expect(latestRead()?.ref).toEqual({
      ...messageRef,
      content_hash: "sha256:frozen",
    });
    expect(
      screen.queryByRole("article", { name: "Summary text" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to summary" }));
    expect(screen.getByRole("article", { name: "Summary text" })).toBe(
      summaryArticle,
    );
    expect(summaryScroll.scrollTop).toBe(210);
    expect(latestRead()?.ref).toEqual(summaryHit.ref);
    expect(
      screen.getByRole("button", { name: /Preview best match/ }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Back to results" }));
    expect(
      screen.queryByRole("region", { name: "Selected source" }),
    ).not.toBeInTheDocument();
    expect(results.scrollTop).toBe(170);
    expect(
      screen.getByRole("button", { name: /Hide matches/ }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("searchbox")).toHaveValue("数据");
    expect(
      screen.getByRole("button", { name: /^Preview summary:/ }),
    ).toHaveFocus();
  });

  it("resets nested history when a different result is selected", () => {
    groupedResult([
      sessionGroup,
      { ...groupFromHit(messageHit), key: "second", title: "Another session" },
    ]);
    readVersions();
    setup();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Preview best match in My storage session",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Read evidence" }));
    expect(
      screen.getByRole("button", { name: "Back to summary" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Preview best match in Another session",
      }),
    );
    expect(
      screen.queryByRole("button", { name: "Back to summary" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Back to results" }),
    ).toBeInTheDocument();
    expect(latestRead()?.ref).toEqual(messageRef);
  });

  it("keeps cross-session summaries separate and deduplicates pages by the authoritative group key", () => {
    const standalone = {
      ...groupFromHit(summaryHit),
      key: "cross_session",
      session_id: undefined,
    };
    const state = {
      ...queryState(),
      data: {
        pages: [
          { groups: [sessionGroup] },
          { groups: [sessionGroup, standalone] },
        ],
        pageParams: [undefined, "next"],
      },
    };
    searchResult(state);
    setup();
    expect(screen.getByText("2 results")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /^Preview best match/ }),
    ).toHaveLength(2);
  });

  it("requests extra matches only on demand and merges repeated preview refs without changing root pagination", () => {
    groupedResult([{ ...sessionGroup, matches_has_more: true }]);
    const view = setup();
    expand();
    fireEvent.click(screen.getByRole("button", { name: /Load more matches/ }));
    expect(useWorkspaceGroupMatches).toHaveBeenLastCalledWith(
      "user_1",
      expect.objectContaining({ query: "数据", limit: 20 }),
      sessionGroup.key,
      true,
    );
    const fetchNextPage = vi.fn();
    extraResult({
      data: {
        pages: [
          {
            hits: [
              ...sessionGroup.matches,
              {
                ...messageHit,
                ref: { ...messageRef, id: "msg_456" },
                snippet: "Another source message",
              },
            ],
          },
        ],
      },
      hasNextPage: true,
      fetchNextPage,
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
      screen.getByRole("button", { name: /Hide matches/ }),
    ).toHaveTextContent("4");
    expect(
      screen.getAllByRole("button", {
        name: /^Preview (summary|message|title):/,
      }),
    ).toHaveLength(4);
    expect(screen.getByText("1 result")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Load more matches/ }));
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });

  it("withholds warm extra matches until revalidation and hides protected results on child denial", () => {
    groupedResult([{ ...sessionGroup, matches_has_more: true }]);
    const cached = {
      ...messageHit,
      ref: { ...messageRef, id: "cached" },
      snippet: "Cached extra text",
    };
    extraResult({
      data: { pages: [{ hits: [cached] }] },
      isFetching: true,
      isFetchedAfterMount: false,
    });
    const view = setup();
    expand();
    fireEvent.click(screen.getByRole("button", { name: /Load more matches/ }));
    expect(screen.queryByText("Cached extra text")).not.toBeInTheDocument();
    extraResult({
      data: { pages: [{ hits: [cached] }] },
      isError: true,
      error: new ApiError("forbidden", 403, {}),
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
      screen.queryByRole("article", { name: "My storage session" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Sign in again");
  });

  it("does not let an old disabled child error block a newly authorized result page", () => {
    groupedResult([{ ...sessionGroup, matches_has_more: true }]);
    extraResult({ isError: true, error: new AuthError() });
    setup();
    expect(
      screen.getByRole("article", { name: "My storage session" }),
    ).toBeInTheDocument();
    expand();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Load more matches/ }),
    ).toBeInTheDocument();
  });

  it("withholds warm grouped results while initial authorization is revalidated", () => {
    searchResult({
      ...queryState(),
      isFetching: true,
      isFetchedAfterMount: false,
    } as ReturnType<typeof queryState>);
    setup();
    expect(screen.queryByText("Database choice")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Searching");
  });

  it("withholds warm reader content and removes the results when its access revalidation is denied", () => {
    sourceResult({
      ...sourceState(message),
      isFetching: true,
      isFetchedAfterMount: false,
    } as ReturnType<typeof sourceState>);
    const view = setup();
    openMessage();
    expect(vi.mocked(useWorkspaceSource).mock.calls.at(-1)?.[2]).toEqual({
      revalidateOnMount: true,
    });
    expect(
      screen.queryByRole("article", { name: "Message text" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading source");
    sourceResult({
      ...sourceState(message),
      isError: true,
      error: new ApiError("forbidden", 403, {}),
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
      screen.queryByRole("region", { name: "Selected source" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Database choice")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Sign in again");
  });

  it("keeps continuation available when a candidate page has no currently visible groups", () => {
    const state = { ...queryState([]), hasNextPage: true };
    searchResult(state);
    setup();
    expect(screen.queryByText("No results")).not.toBeInTheDocument();
    expect(
      screen.getByText("No visible matches in this page"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(state.fetchNextPage).toHaveBeenCalledOnce();
  });

  it("retains visible matches during retryable expansion failures and restarts expired child cursors", () => {
    groupedResult([{ ...sessionGroup, matches_has_more: true }]);
    const view = setup();
    expand();
    fireEvent.click(screen.getByRole("button", { name: /Load more matches/ }));
    const fetchNextPage = vi.fn();
    extraResult({
      isError: true,
      error: new ApiError("unavailable", 503, {}),
      fetchNextPage,
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
      screen.getAllByRole("button", {
        name: /^Preview (summary|message|title):/,
      }),
    ).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Retry matches" }));
    expect(fetchNextPage).toHaveBeenCalledOnce();
    const restart = vi.fn();
    extraResult({
      isError: true,
      error: new ApiError("invalid cursor", 400, {}),
      restart,
    });
    view.rerender(
      <WorkspaceSearch
        userId="user_1"
        query="数据"
        kind="all"
        onNavigate={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reload matches" }));
    expect(restart).toHaveBeenCalledOnce();
    expect(screen.getByText("1 result")).toBeInTheDocument();
  });

  it("only suggests a narrower query when the backend reports the group pagination window limit", () => {
    groupedResult();
    const view = setup();
    expect(
      screen.queryByText("Narrow your search to see more results."),
    ).not.toBeInTheDocument();
    searchResult({
      ...queryState(),
      data: {
        pages: [{ groups: [sessionGroup], pagination_limited: true }],
        pageParams: [undefined],
      },
    } as ReturnType<typeof queryState>);
    view.rerender(
      <WorkspaceSearch
        userId="user_1"
        query="数据"
        kind="all"
        onNavigate={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Narrow your search to see more results."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
  });
});

describe("Individual matches during group migration", () => {
  function rawState() {
    return {
      ...queryState(),
      data: {
        pages: [
          {
            mode: "raw" as const,
            groups: [],
            hits: [
              messageHit,
              {
                ...messageHit,
                ref: { ...messageRef, id: "msg_456" },
                title: "Another match",
              },
            ],
          },
        ],
        pageParams: [undefined],
      },
    };
  }

  it("shows separate hits and truthful match counts without session disclosure controls", () => {
    searchResult(rawState());
    setup();
    expect(screen.getByText("2 matches")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Showing individual matches while session grouping is being prepared.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Results grouped by session. Best matches first."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Show matches in/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Preview message: Database choice" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Preview message: Another match" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Preview message: Database choice" }),
    );
    expect(latestRead()?.ref).toEqual(messageRef);
    expect(screen.getByRole("link", { name: "Open session" })).toHaveAttribute(
      "href",
      "/?session_id=sess_1&message_id=msg_123",
    );
  });

  it("loads additional raw pages and resets selection when retrying grouped search", () => {
    const state = { ...rawState(), hasNextPage: true };
    searchResult(state);
    const view = setup();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(state.fetchNextPage).toHaveBeenCalledOnce();
    fireEvent.click(
      screen.getByRole("button", { name: "Preview message: Database choice" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try grouped search" }));
    expect(state.restart).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("region", { name: "Selected source" }),
    ).not.toBeInTheDocument();
    searchResult(queryState());
    view.rerender(
      <WorkspaceSearch
        userId="user_1"
        query="数据"
        kind="all"
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByText("1 result")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Showing individual matches while session grouping is being prepared.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Show matches in Database choice/ }),
    ).toBeInTheDocument();
  });

  it("keeps raw failures neutral and hides cached raw content on authorization denial", () => {
    searchResult({
      ...rawState(),
      isError: true,
      error: new ApiError("Search request failed", 503, {}),
    });
    const view = setup();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Search is unavailable right now.",
    );
    expect(
      screen.queryByRole("link", { name: "Sign in again" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Retry search" }),
    ).toBeInTheDocument();
    searchResult({
      ...rawState(),
      isError: true,
      error: new ApiError("forbidden", 403, {}),
    });
    view.rerender(
      <WorkspaceSearch
        userId="user_1"
        query="数据"
        kind="all"
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.queryByText("Database choice")).not.toBeInTheDocument();
    expect(screen.queryByText("Another match")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Sign in again" }),
    ).toBeInTheDocument();
  });
});

describe("Summary origin navigation", () => {
  function openSummary(data: WorkspaceSummaryVersion) {
    sourceResult(sourceState(data));
    render(
      <SearchSourcePanel
        userId="user_1"
        sourceRef={{
          kind: "summary",
          id: data.summary_id,
          revision: data.revision,
        }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
  }

  it("opens the summary's canonical origin session with an encoded URL", () => {
    openSummary({ ...summary, origin_session_id: "session/one?&two" });

    expect(screen.getByRole("link", { name: "Open session" })).toHaveAttribute(
      "href",
      "/?session_id=session%2Fone%3F%26two",
    );
  });

  it("does not infer a session from a summary subject or message coverage", () => {
    openSummary({ ...summary, subject_id: "sess_not_a_verified_origin" });

    expect(
      screen.queryByRole("link", { name: "Open session" }),
    ).not.toBeInTheDocument();
  });

  it("hides a cached origin link when summary access is denied", () => {
    sourceResult({
      ...sourceState({ ...summary, origin_session_id: "sess_private" }),
      isError: true,
      error: new ApiError("Access denied", 403, {}),
    });
    render(
      <SearchSourcePanel
        userId="user_1"
        sourceRef={{ kind: "summary", id: summary.summary_id }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("link", { name: "Open session" }),
    ).not.toBeInTheDocument();
  });
});

describe("Literal highlighting", () => {
  it.each([
    "port 数据库",
    "数据库 port",
    "\tPORT\u0085数据库\nport\u3000PORT ",
  ])(
    "highlights every English/Chinese term independently of order and Unicode whitespace: %j",
    (query) => {
      const text = "数据库 uses PORT; transport still matches.";
      const { container } = render(
        <LiteralHighlight text={text} query={query} />,
      );
      expect(
        [...container.querySelectorAll("mark")].map((mark) => mark.textContent),
      ).toEqual(["数据库", "PORT", "port"]);
      expect(container.textContent).toBe(text);
    },
  );

  it("deduplicates case-insensitive terms and coalesces overlapping longest matches without losing text", () => {
    const text = "database banana abcde 😀port";
    const { container } = render(
      <LiteralHighlight
        text={text}
        query="data database DATA ata ana abc bcde 😀port port"
      />,
    );
    expect(
      [...container.querySelectorAll("mark")].map((mark) => mark.textContent),
    ).toEqual(["database", "anana", "abcde", "😀port"]);
    expect(container.querySelector("mark mark")).toBeNull();
    expect(container.textContent).toBe(text);
  });

  it("keeps punctuation literal and HTML inert when multiple terms are highlighted", () => {
    const text = "<img src=x onerror=alert(1)> [a.*] PORT";
    const { container } = render(
      <LiteralHighlight text={text} query="PORT <img [a.*]" />,
    );
    expect(
      [...container.querySelectorAll("mark")].map((mark) => mark.textContent),
    ).toEqual(["<img", "[a.*]", "PORT"]);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe(text);
  });

  it("treats BOM as a literal character rather than a whitespace separator", () => {
    const { container } = render(
      <LiteralHighlight text="port 数据库" query={"port\uFEFF数据库"} />,
    );
    expect(container.querySelector("mark")).toBeNull();
  });

  it.each(["", " \t\n\u0085\u3000"])(
    "renders blank query %j as intact text without marks",
    (query) => {
      const { container } = render(
        <LiteralHighlight text="😀 数据库 PORT" query={query} />,
      );
      expect(container.querySelector("mark")).toBeNull();
      expect(container.textContent).toBe("😀 数据库 PORT");
    },
  );

  it("preserves original Unicode boundaries for several terms and lowercase expansions", () => {
    const text = "İSTANBUL DATA 数据库";
    const { container } = render(
      <LiteralHighlight text={text} query="i data 数据 DATA" />,
    );
    expect(
      [...container.querySelectorAll("mark")].map((mark) => mark.textContent),
    ).toEqual(["İ", "DATA", "数据"]);
    expect(container.textContent).toBe(text);
  });

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

describe("Given workspace search uses Chinese", () => {
  it("submits canonical query values and reads unchanged source content through translated controls", async () => {
    useLocaleStore.setState({ locale: "zh-CN" });
    const user = userEvent.setup();
    const { onNavigate } = setup();
    const searchbox = screen.getByRole("searchbox", { name: "搜索你的工作区" });
    await user.clear(searchbox);
    await user.type(searchbox, "数据库{Enter}");
    expect(onNavigate).toHaveBeenCalledWith(
      "/search?q=%E6%95%B0%E6%8D%AE%E5%BA%93",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "预览 Database choice 中的最佳匹配" }),
    );
    expect(
      screen.getByRole("region", { name: "所选来源" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "完整消息" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "打开会话" })).toHaveAttribute(
      "href",
      "/?session_id=sess_1&message_id=msg_123",
    );
    expect(screen.getByLabelText("消息正文")).toHaveTextContent(
      "We chose 数据库",
    );
    fireEvent.click(screen.getByRole("button", { name: "关闭来源" }));
    expect(
      screen.queryByRole("region", { name: "所选来源" }),
    ).not.toBeInTheDocument();
  });
});
