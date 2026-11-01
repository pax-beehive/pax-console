/* @vitest-environment jsdom */

import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthError, ApiError } from "@/features/api/errors";
import {
  useDeveloperSummaries,
  useDeveloperSummary,
  type DeveloperSummaryItem,
} from "@/features/api/developer-summaries";
import { useConsoleStore } from "@/stores/console-store";
import { SummaryBrowserAccess } from "./summary-browser";
import {
  useWorkspaceSource,
  type WorkspaceMessageRead,
  type WorkspaceSummaryVersion,
} from "@/features/api/workspace-search";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/summaries" }));
vi.mock("@/features/api/developer-summaries", () => ({
  useDeveloperSummaries: vi.fn(),
  useDeveloperSummary: vi.fn(),
}));
vi.mock("@/features/api/workspace-search", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useWorkspaceSource: vi.fn(),
}));
vi.mock("@/components/search/search-source-panel", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  SummaryContent: ({
    summary,
    onSelect,
  }: {
    summary: { body: string };
    onSelect: (ref: unknown) => void;
  }) => (
    <div>
      {summary.body}
      <button
        onClick={() =>
          onSelect({
            kind: "message",
            id: "message_1",
            content_hash: "hash_1",
            canonicalization_version: "visible-text-v1",
          })
        }
      >
        Read evidence
      </button>
    </div>
  ),
}));
const item: DeveloperSummaryItem = {
  summary_id: "summary_1",
  revision: 4,
  title: "Database decision",
  body_preview: "Use PostgreSQL",
  subject_type: "fragment",
  subject_id: "secretary:session:sess_1",
  claim_count: 1,
  coverage_count: 2,
  summary_source_count: 0,
  created_at: "2026-11-01T00:00:00Z",
};
const summary: WorkspaceSummaryVersion = {
  ...item,
  owner_user_id: "admin",
  body: "Use PostgreSQL for durable messages.",
  coverage: [
    {
      message_id: "message_1",
      content_hash: "hash_1",
      canonicalization_version: "visible-text-v1",
    },
  ],
};
const admin = { user_id: "admin", email: "admin@example.test", is_admin: true };
const sourceMessage: WorkspaceMessageRead = {
  ref: {
    kind: "message",
    id: "message_1",
    content_hash: "hash_1",
    canonicalization_version: "visible-text-v1",
  },
  message_id: "message_1",
  agent_id: "agent_1",
  session_id: "session_1",
  role: "assistant",
  session_seq: 1,
  created_at: "2026-11-01T00:00:00Z",
  text: "Frozen message evidence.",
  view: "last",
  available_views: ["last", "full"],
  has_more: false,
  read_receipt: "fixture-receipt",
};
type ListFixture = {
  data: ReturnType<typeof useDeveloperSummaries>["data"];
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  error: Error | null;
  restart: ReturnType<typeof vi.fn>;
  fetchNextPage: ReturnType<typeof vi.fn>;
};
type DetailFixture = {
  data: ReturnType<typeof useDeveloperSummary>["data"];
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
};
let listResult: ListFixture;
let detailResult: DetailFixture;
let sourceResult: {
  data: WorkspaceMessageRead;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
};
function renderAccess(user = admin) {
  return render(
    <TooltipProvider>
      <SummaryBrowserAccess user={user} />
    </TooltipProvider>,
  );
}
beforeEach(() => {
  vi.stubGlobal("React", React);
  useConsoleStore.setState({ previewAsUser: false });
  listResult = {
    data: { pages: [{ items: [item] }], pageParams: [undefined] },
    isPending: false,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    error: null,
    restart: vi.fn(),
    fetchNextPage: vi.fn(),
  };
  detailResult = {
    data: { summary },
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  };
  sourceResult = {
    data: sourceMessage,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
  vi.mocked(useDeveloperSummaries).mockImplementation(
    () => listResult as unknown as ReturnType<typeof useDeveloperSummaries>,
  );
  vi.mocked(useDeveloperSummary).mockImplementation(
    () => detailResult as unknown as ReturnType<typeof useDeveloperSummary>,
  );
  vi.mocked(useWorkspaceSource).mockImplementation(
    () => sourceResult as unknown as ReturnType<typeof useWorkspaceSource>,
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("summary developer access", () => {
  it("does not mount list or detail requests for ordinary users", () => {
    renderAccess({ ...admin, is_admin: false });
    expect(screen.getByRole("alert")).toHaveTextContent("administrators");
    expect(useDeveloperSummaries).not.toHaveBeenCalled();
    expect(useDeveloperSummary).not.toHaveBeenCalled();
  });
  it("unmounts protected content when the admin previews as a user", () => {
    const view = renderAccess();
    fireEvent.click(screen.getByRole("button", { name: /Database decision/ }));
    expect(screen.getByText(summary.body)).toBeInTheDocument();
    useConsoleStore.setState({ previewAsUser: true });
    view.rerender(
      <TooltipProvider>
        <SummaryBrowserAccess user={admin} />
      </TooltipProvider>,
    );
    expect(screen.queryByText(summary.body)).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("administrators");
  });
  it("hides cached lists and detail on a backend permission denial", () => {
    const view = renderAccess();
    fireEvent.click(screen.getByRole("button", { name: /Database decision/ }));
    listResult = { ...listResult, isError: true, error: new AuthError() };
    view.rerender(
      <TooltipProvider>
        <SummaryBrowserAccess user={admin} />
      </TooltipProvider>,
    );
    expect(screen.queryByText(summary.body)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Database decision/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Access denied");
  });
  it("hides cached list data when the detail request loses administrator access", () => {
    detailResult = {
      ...detailResult,
      isError: true,
      error: new AuthError(),
    };
    renderAccess();
    fireEvent.click(screen.getByRole("button", { name: /Database decision/ }));
    expect(screen.queryByText(summary.body)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Database decision/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Access denied");
    fireEvent.click(screen.getByRole("button", { name: "Refresh summaries" }));
    expect(listResult.restart).toHaveBeenCalledOnce();
  });
  it.each([
    new AuthError(),
    new ApiError("unauthorized", 401, {}),
    new ApiError("forbidden", 403, {}),
  ])(
    "hides all cached developer data when an evidence read loses access (%s)",
    (error) => {
      sourceResult = { ...sourceResult, isError: true, error };
      renderAccess();
      fireEvent.click(
        screen.getByRole("button", { name: /Database decision/ }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Read evidence" }));
      expect(
        screen.queryByRole("button", { name: /Database decision/ }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(summary.body)).not.toBeInTheDocument();
      expect(screen.queryByText(sourceMessage.text)).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Close source" }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Access denied");
    },
  );
});

describe("summary inspection", () => {
  it("lists current summaries without a search query and opens exact revisions", () => {
    renderAccess();
    expect(
      screen.getByRole("heading", { name: "Summary developer" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Your current summaries")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Database decision/ }));
    expect(useDeveloperSummary).toHaveBeenLastCalledWith("admin", {
      id: "summary_1",
      revision: 4,
    });
    expect(screen.getByText(summary.body)).toBeInTheDocument();
    expect(screen.getByText("secretary:session:sess_1")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Raw JSON"));
    expect(screen.getByLabelText("Summary JSON")).toHaveTextContent(
      '"owner_user_id": "admin"',
    );
  });
  it("uses the existing source panel with exact frozen message references", () => {
    renderAccess();
    fireEvent.click(screen.getByRole("button", { name: /Database decision/ }));
    fireEvent.click(screen.getByRole("button", { name: "Read evidence" }));
    expect(
      screen.getByRole("article", { name: "Message text" }),
    ).toHaveTextContent(sourceMessage.text);
    expect(useWorkspaceSource).toHaveBeenLastCalledWith(
      "admin",
      expect.objectContaining({
        ref: sourceMessage.ref,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Close source" }));
    expect(screen.getByText(summary.body)).toBeInTheDocument();
  });
  it("looks up a historical revision directly without requiring a list match", () => {
    renderAccess();
    fireEvent.change(screen.getByLabelText("Summary ID"), {
      target: { value: " summary_old " },
    });
    fireEvent.change(screen.getByLabelText("Revision"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open summary" }));
    expect(useDeveloperSummary).toHaveBeenLastCalledWith("admin", {
      id: "summary_old",
      revision: 2,
    });
  });
  it("forwards a long summary ID without introducing a client-only length limit", () => {
    const id = "summary_" + "source_".repeat(100);
    renderAccess();
    const input = screen.getByLabelText("Summary ID");
    expect(input).not.toHaveAttribute("maxlength");
    fireEvent.change(input, { target: { value: id } });
    fireEvent.click(screen.getByRole("button", { name: "Open summary" }));
    expect(useDeveloperSummary).toHaveBeenLastCalledWith("admin", { id });
  });
  it("refreshes from the first list page and clears the selected detail", () => {
    renderAccess();
    fireEvent.click(screen.getByRole("button", { name: /Database decision/ }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh summaries" }));
    expect(listResult.restart).toHaveBeenCalledOnce();
    expect(screen.queryByText(summary.body)).not.toBeInTheDocument();
  });
  it("retains load more for an empty filtered page with a continuation", () => {
    listResult = {
      ...listResult,
      data: { pages: [{ items: [] }], pageParams: [undefined] },
      hasNextPage: true,
    };
    renderAccess();
    fireEvent.click(
      screen.getByRole("button", { name: "Load more summaries" }),
    );
    expect(listResult.fetchNextPage).toHaveBeenCalledOnce();
    expect(screen.queryByText("No summaries yet.")).not.toBeInTheDocument();
  });
  it("has a truthful empty state and a loading state", () => {
    listResult = {
      ...listResult,
      data: { pages: [{ items: [] }], pageParams: [undefined] },
    };
    const view = renderAccess();
    expect(screen.getByText("No summaries yet.")).toBeInTheDocument();
    listResult = { ...listResult, isPending: true, data: undefined };
    view.rerender(
      <TooltipProvider>
        <SummaryBrowserAccess user={admin} />
      </TooltipProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading summaries");
  });
  it.each([404, 409])(
    "does not expose cached detail after version failure %s",
    (status) => {
      detailResult = {
        ...detailResult,
        isError: true,
        error: new ApiError("failed", status, {}),
      };
      renderAccess();
      fireEvent.click(
        screen.getByRole("button", { name: /Database decision/ }),
      );
      expect(screen.queryByText(summary.body)).not.toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("unavailable");
    },
  );
});
