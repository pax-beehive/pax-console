/* @vitest-environment jsdom */

import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/features/api/errors";
import { useSecretarySummaryRevisions } from "@/features/api/secretary-summaries";
import { SecretarySummaryHistory } from "./secretary-summary-history";

vi.mock("@/features/api/secretary-summaries", () => ({
  useSecretarySummaryRevisions: vi.fn(),
}));

const version = {
  summary_id: "summary_1",
  revision: 3,
  title: "Storage decision",
  created_at: "2026-11-02T12:00:00Z",
};
function state(overrides: Record<string, unknown> = {}) {
  return {
    data: { pages: [{ items: [version] }] },
    isPending: false,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    hasNextPage: false,
    error: null,
    restart: vi.fn(),
    fetchNextPage: vi.fn(),
    ...overrides,
  };
}
let query: ReturnType<typeof state>;
let denied = vi.fn<() => void>();
function show() {
  const result = render(
    <TooltipProvider>
      <SecretarySummaryHistory
        userId="owner"
        summaryId="summary_1"
        selectedRevision={3}
        onSelect={vi.fn()}
        onAccessDenied={denied}
      />
    </TooltipProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Version history" }));
  return result;
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  query = state();
  denied = vi.fn<() => void>();
  vi.mocked(useSecretarySummaryRevisions).mockImplementation(
    () => query as unknown as ReturnType<typeof useSecretarySummaryRevisions>,
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("Summary version history", () => {
  it("keeps an empty authorized page's continuation and deduplicates repeated revisions", () => {
    query = state({ data: { pages: [{ items: [] }] }, hasNextPage: true });
    const view = show();
    expect(
      screen.getByText("No readable versions in this page."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more versions" }));
    expect(query.fetchNextPage).toHaveBeenCalledOnce();
    query = state({
      data: { pages: [{ items: [version] }, { items: [version] }] },
    });
    view.rerender(
      <TooltipProvider>
        <SecretarySummaryHistory
          userId="owner"
          summaryId="summary_1"
          selectedRevision={3}
          onSelect={vi.fn()}
          onAccessDenied={denied}
        />
      </TooltipProvider>,
    );
    expect(
      screen.getAllByRole("button", { name: "Read version 3" }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Read version 3" }),
    ).toHaveAttribute("aria-current", "page");
  });
  it("does not show rows returned for another summary", () => {
    query = state({
      data: { pages: [{ items: [{ ...version, summary_id: "wrong" }] }] },
    });
    show();
    expect(
      screen.queryByRole("button", { name: "Read version 3" }),
    ).not.toBeInTheDocument();
  });
  it("hides cached history during a failed refresh and permits an explicit restart", () => {
    query = state({
      isError: true,
      error: new ApiError("unavailable", 503, {}),
    });
    show();
    expect(
      screen.queryByRole("button", { name: "Read version 3" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reload versions" }));
    expect(query.restart).toHaveBeenCalledOnce();
  });
  it("retains existing versions after a continuation error and restarts an expired cursor", () => {
    query = state({
      isError: true,
      isFetchNextPageError: true,
      error: new ApiError("cursor expired", 400, {}),
    });
    show();
    expect(
      screen.getByRole("button", { name: "Read version 3" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Reload versions to start again",
    );
    fireEvent.click(screen.getByRole("button", { name: "Reload versions" }));
    expect(query.restart).toHaveBeenCalledOnce();
    expect(query.fetchNextPage).not.toHaveBeenCalled();
  });
  it("removes all parent content through the access-denied callback", () => {
    query = state({ isError: true, error: new ApiError("forbidden", 403, {}) });
    show();
    expect(
      screen.queryByRole("button", { name: "Read version 3" }),
    ).not.toBeInTheDocument();
    expect(denied).toHaveBeenCalledOnce();
  });
  it("rechecks a warm history cache on reopen without exposing old rows", () => {
    const view = show();
    fireEvent.click(screen.getByRole("button", { name: "Version history" }));
    query = state({ isFetching: true });
    view.rerender(
      <TooltipProvider>
        <SecretarySummaryHistory
          userId="owner"
          summaryId="summary_1"
          selectedRevision={3}
          onSelect={vi.fn()}
          onAccessDenied={denied}
        />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Version history" }));
    expect(screen.getByRole("status")).toHaveTextContent("Loading versions");
    expect(
      screen.queryByRole("button", { name: "Read version 3" }),
    ).not.toBeInTheDocument();
  });
});
