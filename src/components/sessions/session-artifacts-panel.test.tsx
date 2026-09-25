/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { SessionArtifact } from "@/features/api/types";
import { SessionArtifactsPanel } from "./session-artifacts-panel";

const artifacts: SessionArtifact[] = Array.from({ length: 17 }, (_, i) => ({
  artifact_id: `artifact_${i}`,
  title: `Prototype ${i}`,
  kind: "file",
  schema_version: 1,
  status: "available",
  contents: [
    { ref: "main", filename: `prototype-${i}.txt`, content_type: "text/plain" },
  ],
}));
beforeEach(() =>
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  ),
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function view(loadPreview = vi.fn().mockResolvedValue({})) {
  render(
    <TooltipProvider>
      <SessionArtifactsPanel
        artifacts={artifacts}
        downloadHref={(artifact) => `/download/${artifact.artifact_id}`}
        isLoading={false}
        onLoadPreview={loadPreview}
        onRefresh={vi.fn()}
      />
    </TooltipProvider>,
  );
  return loadPreview;
}
it("opens the selected preview in place, without loading a hidden default artifact", async () => {
  const load = view();
  expect(
    screen.getAllByRole("button", { name: /Open artifact:/ }),
  ).toHaveLength(17);
  expect(load).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Open artifact: Prototype 16" }),
  );
  expect(
    screen.getByRole("region", { name: "Artifact viewer: Prototype 16" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /Open artifact:/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Back to artifacts" }),
  ).toHaveFocus();
  await waitFor(() => expect(load).toHaveBeenCalledWith(artifacts[16]));
  expect(screen.getByRole("link", { name: "Open page" })).toHaveAttribute(
    "href",
    "/artifacts/files/artifact_16?ref=main",
  );
});
it("returns to the same scroll position and selected row", () => {
  view();
  const list = screen.getByRole("region", { name: "Artifact list" });
  list.scrollTop = 850;
  const row = screen.getByRole("button", {
    name: "Open artifact: Prototype 14",
  });
  fireEvent.click(row);
  fireEvent.click(screen.getByRole("button", { name: "Back to artifacts" }));
  expect(screen.getByRole("region", { name: "Artifact list" })).toHaveProperty(
    "scrollTop",
    850,
  );
  expect(row).toHaveFocus();
  expect(row).toHaveAttribute("aria-current", "true");
});
it("keeps preview errors and navigation visible", async () => {
  view(vi.fn().mockRejectedValue(new Error("Preview failed")));
  fireEvent.click(
    screen.getByRole("button", { name: "Open artifact: Prototype 0" }),
  );
  const viewer = screen.getByRole("region", {
    name: "Artifact viewer: Prototype 0",
  });
  await waitFor(() =>
    expect(within(viewer).getByText(/Preview failed/)).toBeVisible(),
  );
  expect(
    screen.getByRole("button", { name: "Back to artifacts" }),
  ).toBeVisible();
});
