/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ArtifactViewerShell } from "./artifact-viewer-shell";

const artifact = {
  id: "artifact_1",
  sourceType: "session_artifact" as const,
  previewMode: "document" as const,
  title: "Result",
  filename: "result.json",
  contentType: "application/json",
  status: "available",
  downloadHref: "/download",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ArtifactViewerShell", () => {
  it("loads text previews through the resolved structured renderer", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response('{"hello":"world"}', {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(
      <TooltipProvider>
        <ArtifactViewerShell
          artifact={artifact}
          loadPreview={async () => ({
            previewKind: "json",
            url: "https://signed.example/result.json",
          })}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() => {
      expect(container).toHaveTextContent("world");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://signed.example/result.json",
      { credentials: "omit" },
    );
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      "https://signed.example/result.json",
    );
  });

  it("opens and closes the host-owned fullscreen dialog", () => {
    render(
      <TooltipProvider>
        <ArtifactViewerShell artifact={artifact} />
      </TooltipProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Open artifact fullscreen" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Artifact viewer: Result" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
