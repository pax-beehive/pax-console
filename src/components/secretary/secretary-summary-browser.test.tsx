/* @vitest-environment jsdom */

import React from "react";
import "@testing-library/jest-dom/vitest";
import {
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
  useSecretarySummaries,
  useSecretarySummary,
  useSecretarySummaryRevisions,
} from "@/features/api/secretary-summaries";
import {
  useWorkspaceSource,
  type WorkspaceMessageRead,
  type WorkspaceSummaryVersion,
} from "@/features/api/workspace-search";
import {
  SecretarySummaryBrowser,
  secretarySummaryHref,
} from "./secretary-summary-browser";

vi.mock("@/features/api/secretary-summaries", () => ({
  useSecretarySummaries: vi.fn(),
  useSecretarySummary: vi.fn(),
  useSecretarySummaryRevisions: vi.fn(),
}));
vi.mock("@/features/api/workspace-search", async (original) => ({
  ...(await original<object>()),
  useWorkspaceSource: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/settings/secretary/summaries",
}));

const item = {
  summary_id: "summary_1",
  revision: 4,
  title: "Database decision",
  body_preview: "Keep messages in PostgreSQL.",
  subject_type: "fragment" as const,
  subject_id: "secretary:session:internal_source_id",
  claim_count: 1,
  coverage_count: 1,
  summary_source_count: 0,
  created_at: "2026-11-02T12:00:00Z",
};
const summary: WorkspaceSummaryVersion = {
  ...item,
  owner_user_id: "owner",
  body: "## Storage\n\nKeep **messages** in PostgreSQL.\n\n- Search uses ES.",
  coverage: [
    {
      message_id: "message_1",
      content_hash: "hash_1",
      canonicalization_version: "visible-text-v1",
    },
  ],
  claims: [
    {
      id: "claim_1",
      text: "Use PostgreSQL",
      evidence: [
        {
          message: {
            message_id: "message_1",
            content_hash: "hash_1",
            canonicalization_version: "visible-text-v1",
          },
          quote: "Store original messages in PG.",
        },
      ],
    },
  ],
};
const message: WorkspaceMessageRead = {
  ref: {
    kind: "message",
    id: "message_1",
    content_hash: "hash_1",
    canonicalization_version: "visible-text-v1",
  },
  message_id: "message_1",
  agent_id: "agent_1",
  session_id: "sess_real",
  role: "assistant",
  session_seq: 7,
  created_at: "2026-11-01T00:00:00Z",
  text: "Store original messages in PG.",
  view: "last",
  available_views: ["last", "full"],
  has_more: false,
  read_receipt: "fixture-receipt",
};

function createList() {
  return {
    data: { pages: [{ items: [item] }], pageParams: [undefined] },
    isPending: false,
    isError: false,
    isFetching: false,
    isFetchedAfterMount: true,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    hasNextPage: false,
    error: null as Error | null,
    restart: vi.fn().mockResolvedValue(undefined),
    fetchNextPage: vi.fn(),
  };
}
function createDetail() {
  return {
    data: summary,
    isPending: false,
    isError: false,
    isFetching: false,
    isFetchedAfterMount: true,
    error: null as Error | null,
    refetch: vi.fn(),
  };
}
let list: ReturnType<typeof createList>;
let detail: ReturnType<typeof createDetail>;
let source: {
  data: WorkspaceMessageRead;
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  isFetchedAfterMount: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
};
let navigate = vi.fn<(href: string) => void>();
function show(selection?: { id: string; revision?: number }) {
  return render(
    <TooltipProvider>
      <SecretarySummaryBrowser
        userId="owner"
        selection={selection}
        onNavigate={navigate}
      />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  list = createList();
  detail = createDetail();
  source = {
    data: message,
    isPending: false,
    isError: false,
    isFetching: false,
    isFetchedAfterMount: true,
    error: null,
    refetch: vi.fn(),
  };
  navigate = vi.fn<(href: string) => void>();
  vi.mocked(useSecretarySummaries).mockImplementation(
    () => list as unknown as ReturnType<typeof useSecretarySummaries>,
  );
  vi.mocked(useSecretarySummaryRevisions).mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    isFetching: false,
    isFetchedAfterMount: true,
    hasNextPage: false,
    restart: vi.fn(),
    fetchNextPage: vi.fn(),
  } as unknown as ReturnType<typeof useSecretarySummaryRevisions>);
  vi.mocked(useSecretarySummary).mockImplementation(
    () => detail as unknown as ReturnType<typeof useSecretarySummary>,
  );
  vi.mocked(useWorkspaceSource).mockImplementation(
    () => source as unknown as ReturnType<typeof useWorkspaceSource>,
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("Secretary summary reading", () => {
  it("shows loading rather than an empty result while the list is pending", () => {
    list = { ...list, isPending: true, isFetching: true };
    show();
    expect(screen.getByRole("status")).toHaveTextContent("Loading summaries");
    expect(
      screen.queryByText("No published summaries yet."),
    ).not.toBeInTheDocument();
  });
  it("waits for entry revalidation before showing cached list or detail text", () => {
    list = { ...list, isFetching: true, isFetchedAfterMount: false };
    detail = { ...detail, isFetching: true, isFetchedAfterMount: false };
    show({ id: item.summary_id, revision: item.revision });
    expect(
      screen.queryByRole("link", { name: /Database decision/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Storage" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(2);
  });
  it("shows the owner's current summaries without a keyword or admin controls", () => {
    show();
    expect(useSecretarySummaries).toHaveBeenCalledWith("owner");
    expect(
      screen.getByRole("link", { name: /Database decision/ }),
    ).toHaveAttribute(
      "href",
      "/settings/secretary/summaries?summary_id=summary_1&revision=4",
    );
    expect(
      screen.getByText("Keep messages in PostgreSQL."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Newest summaries first/)).toBeInTheDocument();
    expect(screen.queryByText("Raw JSON")).not.toBeInTheDocument();
  });
  it("keeps independent summaries from the same origin session in the list", () => {
    const origin = {
      node_type: "summary" as const,
      origin_source_id: "source_1",
      origin_session_id: "sess_origin",
      origin_session_title: "Search and deployment",
    };
    list.data.pages[0].items = [
      { ...item, ...origin },
      {
        ...item,
        ...origin,
        summary_id: "summary_2",
        title: "Deployment recovery",
      },
    ];
    show();
    expect(
      screen.getByRole("list", { name: "Summary list" }).children,
    ).toHaveLength(2);
    expect(screen.getAllByText("Search and deployment")).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: /Deployment recovery/ }),
    ).toHaveAttribute(
      "href",
      "/settings/secretary/summaries?summary_id=summary_2&revision=4",
    );
  });
  it("marks a stale summary as awaiting update while retaining its readable content", () => {
    list.data.pages[0].items = [
      { ...item, node_status: "stale" } as typeof item,
    ];
    detail = { ...detail, data: { ...summary, node_status: "stale" } };
    show({ id: item.summary_id, revision: 4 });
    expect(screen.getAllByText("Awaiting update")).toHaveLength(2);
    expect(
      screen.getByRole("heading", { name: "Storage" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No retained content/)).not.toBeInTheDocument();
  });
  it("labels an explicit empty result without inferring state from its body", () => {
    list.data.pages[0].items = [
      { ...item, node_status: "empty" } as typeof item,
    ];
    detail = {
      ...detail,
      data: { ...summary, node_status: "empty", body: "" },
    };
    show({ id: item.summary_id, revision: 4 });
    expect(
      screen.getAllByText(/No retained content in this version/),
    ).toHaveLength(2);
    expect(
      screen.queryByText("Keep messages in PostgreSQL."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Version history" }),
    ).toBeInTheDocument();
  });
  it("links only the supplied organizing session and keeps its ID separate from the subject", () => {
    detail = {
      ...detail,
      data: {
        ...summary,
        origin_session_id: "sess origin/&",
        origin_session_title: "Original conversation",
      },
    };
    show({ id: item.summary_id, revision: 4 });
    expect(
      screen.getByRole("link", { name: "Original conversation" }),
    ).toHaveAttribute("href", "/?session_id=sess%20origin%2F%26");
  });
  it("loads revision history only when requested and navigates to an exact version", () => {
    vi.mocked(useSecretarySummaryRevisions).mockReturnValue({
      data: { pages: [{ items: [{ ...item, revision: 2 }] }] },
      isPending: false,
      isError: false,
      isFetching: false,
      isFetchedAfterMount: true,
      hasNextPage: false,
      restart: vi.fn(),
      fetchNextPage: vi.fn(),
    } as unknown as ReturnType<typeof useSecretarySummaryRevisions>);
    show({ id: item.summary_id, revision: 4 });
    expect(useSecretarySummaryRevisions).toHaveBeenLastCalledWith(
      "owner",
      item.summary_id,
      false,
    );
    expect(
      screen.queryByRole("button", { name: "Read version 2" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Version history" }));
    expect(useSecretarySummaryRevisions).toHaveBeenLastCalledWith(
      "owner",
      item.summary_id,
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Read version 2" }));
    expect(navigate).toHaveBeenCalledWith(
      "/settings/secretary/summaries?summary_id=summary_1&revision=2",
    );
  });
  it("does not expose cached versions while history access is being checked", () => {
    vi.mocked(useSecretarySummaryRevisions).mockReturnValue({
      data: { pages: [{ items: [{ ...item, revision: 2 }] }] },
      isPending: false,
      isError: false,
      isFetching: true,
      isFetchedAfterMount: false,
      hasNextPage: false,
    } as unknown as ReturnType<typeof useSecretarySummaryRevisions>);
    show({ id: item.summary_id, revision: 4 });
    fireEvent.click(screen.getByRole("button", { name: "Version history" }));
    expect(
      screen.queryByRole("button", { name: "Read version 2" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading versions");
  });
  it("renders the full Markdown summary, revision and frozen evidence", () => {
    show({ id: item.summary_id, revision: item.revision });
    expect(useSecretarySummary).toHaveBeenCalledWith("owner", {
      id: "summary_1",
      revision: 4,
    });
    expect(
      screen.getByRole("heading", { name: "Storage" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("messages", { selector: "strong" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Version 4")).toBeInTheDocument();
    expect(
      screen.getByText("Store original messages in PG."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /session/i }),
    ).not.toBeInTheDocument();
  });
  it("opens exact evidence and links to its real session and message", () => {
    show({ id: item.summary_id, revision: item.revision });
    const summaryBody = screen.getByRole("article", { name: "Summary text" });
    fireEvent.click(screen.getByRole("button", { name: "Read evidence" }));
    expect(summaryBody).toBeInTheDocument();
    expect(summaryBody).not.toBeVisible();
    expect(useWorkspaceSource).toHaveBeenCalledWith(
      "owner",
      expect.objectContaining({ ref: message.ref }),
      { revalidateOnMount: true },
    );
    expect(screen.getByRole("link", { name: /Open session/ })).toHaveAttribute(
      "href",
      "/?session_id=sess_real&message_id=message_1",
    );
    fireEvent.click(screen.getByRole("button", { name: "Close source" }));
    expect(summaryBody).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Storage" }),
    ).toBeInTheDocument();
  });
  it("preserves child summary versions in navigation", () => {
    detail = {
      ...detail,
      data: {
        ...summary,
        summary_sources: [{ summary_id: "child & one", revision: 2 }],
      },
    };
    show({ id: item.summary_id, revision: item.revision });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Open summary child & one, version 2",
      }),
    );
    expect(navigate).toHaveBeenCalledWith(
      "/settings/secretary/summaries?summary_id=child+%26+one&revision=2",
    );
  });
  it("can return to the list on mobile and refresh from the first page", () => {
    show({ id: item.summary_id, revision: item.revision });
    fireEvent.click(screen.getByRole("button", { name: "Back to summaries" }));
    expect(navigate).toHaveBeenCalledWith("/settings/secretary/summaries");
    fireEvent.click(screen.getByRole("button", { name: "Refresh summaries" }));
    expect(list.restart).toHaveBeenCalledOnce();
  });
  it("keeps pagination available for a permission-filtered empty page", () => {
    list.data.pages[0].items = [];
    list.hasNextPage = true;
    show();
    fireEvent.click(
      screen.getByRole("button", { name: "Load more summaries" }),
    );
    expect(list.fetchNextPage).toHaveBeenCalledOnce();
    expect(
      screen.queryByText("No published summaries yet."),
    ).not.toBeInTheDocument();
  });
  it("explains an empty result and links back to Secretary settings", () => {
    list.data.pages[0].items = [];
    show();
    expect(screen.getByText("No published summaries yet.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Secretary settings" }),
    ).toHaveAttribute("href", "/settings/secretary");
  });
  it("allows retrying a failed page without losing loaded summaries", () => {
    list = {
      ...list,
      isError: true,
      isFetchNextPageError: true,
      hasNextPage: true,
      error: new ApiError("unavailable", 503, {}),
    };
    show();
    expect(
      screen.getByRole("link", { name: /Database decision/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading more" }));
    expect(list.fetchNextPage).toHaveBeenCalledOnce();
  });
  it("restarts an expired cursor rather than repeatedly requesting it", () => {
    list = {
      ...list,
      isError: true,
      isFetchNextPageError: true,
      hasNextPage: true,
      error: new ApiError("cursor expired", 400, {}),
    };
    show();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Refresh summaries to start again",
    );
    expect(
      screen.getByRole("link", { name: /Database decision/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Retry loading more" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh summaries" }));
    expect(list.restart).toHaveBeenCalledOnce();
  });
  it("hides cached rows after a failed list read and provides refresh", () => {
    list = {
      ...list,
      isError: true,
      error: new ApiError("unavailable", 503, {}),
    };
    show();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load summaries",
    );
    expect(
      screen.queryByRole("link", { name: /Database decision/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh summaries" }));
    expect(list.restart).toHaveBeenCalledOnce();
  });
  it("hides all cached content if the list loses access", () => {
    list = {
      ...list,
      isError: true,
      error: new ApiError("forbidden", 403, {}),
    };
    show({ id: item.summary_id, revision: item.revision });
    expect(screen.getByRole("alert")).toHaveTextContent("no longer available");
    expect(
      screen.queryByRole("heading", { name: "Storage" }),
    ).not.toBeInTheDocument();
    expect(useSecretarySummary).not.toHaveBeenCalled();
  });
  it("keeps the selected immutable version when a newer list version appears", () => {
    list.data.pages[0].items = [{ ...item, revision: 5 }];
    show({ id: item.summary_id, revision: 4 });
    expect(useSecretarySummary).toHaveBeenCalledWith("owner", {
      id: item.summary_id,
      revision: 4,
    });
    expect(screen.getByText("Version 4")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Database decision/ }),
    ).toHaveAttribute(
      "href",
      "/settings/secretary/summaries?summary_id=summary_1&revision=5",
    );
  });
  it("shows an invalid-version notice without mounting a detail read", () => {
    render(
      <TooltipProvider>
        <SecretarySummaryBrowser
          userId="owner"
          invalidSelection
          onNavigate={navigate}
        />
      </TooltipProvider>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("invalid version");
    expect(useSecretarySummary).not.toHaveBeenCalled();
  });
  it("hides stale detail after a read error and offers retry", () => {
    detail = {
      ...detail,
      isError: true,
      error: new ApiError("unavailable", 503, {}),
    };
    show({ id: item.summary_id, revision: item.revision });
    expect(
      screen.queryByRole("heading", { name: "Storage" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry summary" }));
    expect(detail.refetch).toHaveBeenCalledOnce();
  });
  it.each([404, 409])(
    "does not substitute current content for an unavailable version (%s)",
    (status) => {
      detail = {
        ...detail,
        isError: true,
        error: new ApiError("unavailable", status, {}),
      };
      show({ id: item.summary_id, revision: item.revision });
      expect(screen.getByRole("alert")).toHaveTextContent("unavailable");
      expect(
        screen.queryByRole("heading", { name: "Storage" }),
      ).not.toBeInTheDocument();
    },
  );
  it("hides list and detail caches after a denied summary read", () => {
    detail = { ...detail, isError: true, error: new AuthError() };
    show({ id: item.summary_id, revision: item.revision });
    expect(screen.getByRole("alert")).toHaveTextContent("no longer available");
    expect(
      screen.queryByRole("link", { name: /Database decision/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Storage" }),
    ).not.toBeInTheDocument();
  });
  it("hides caches when an evidence read is denied", () => {
    source = {
      ...source,
      isError: true,
      error: new ApiError("forbidden", 403, {}),
    };
    show({ id: item.summary_id, revision: item.revision });
    fireEvent.click(screen.getByRole("button", { name: "Read evidence" }));
    expect(screen.getByRole("alert")).toHaveTextContent("no longer available");
    expect(
      screen.queryByRole("link", { name: /Database decision/ }),
    ).not.toBeInTheDocument();
  });
  it("checks evidence access again before exposing a warm cached source", () => {
    source = { ...source, isFetching: true, isFetchedAfterMount: false };
    show({ id: item.summary_id, revision: item.revision });
    fireEvent.click(screen.getByRole("button", { name: "Read evidence" }));
    expect(screen.getByRole("status")).toHaveTextContent("Loading source");
    expect(
      screen.queryByRole("link", { name: /Open session/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("article", { name: "Summary text" }),
    ).not.toBeInTheDocument();
  });
  it("wraps long titles and summary text inside narrow reading panes", () => {
    const title = "数据库".repeat(120);
    detail = { ...detail, data: { ...summary, title } };
    show({ id: item.summary_id, revision: item.revision });
    expect(
      within(screen.getByRole("region", { name: "Summary details" })).getByRole(
        "heading",
        { name: title },
      ),
    ).toHaveClass("[overflow-wrap:anywhere]");
    expect(screen.getByRole("article", { name: "Summary text" })).toHaveClass(
      "min-w-0",
    );
  });
  it("encodes opaque summary IDs when building stable selection links", () => {
    expect(secretarySummaryHref({ id: "id /?&", revision: 3 })).toBe(
      "/settings/secretary/summaries?summary_id=id+%2F%3F%26&revision=3",
    );
    expect(secretarySummaryHref()).toBe("/settings/secretary/summaries");
  });
});
