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
          viewerHref="/artifacts/files/artifact_1?ref=main"
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
    expect(screen.getByRole("link", { name: "Open file" })).toHaveAttribute(
      "href",
      "https://signed.example/result.json",
    );
    expect(screen.getByRole("link", { name: "Open page" })).toHaveAttribute(
      "href",
      "/artifacts/files/artifact_1?ref=main",
    );
  });

  it("renders markdown filenames as documents despite generic text metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("# Rendered heading\n\nReadable paragraph.", {
            headers: { "content-type": "text/plain" },
            status: 200,
          }),
      ),
    );

    render(
      <TooltipProvider>
        <ArtifactViewerShell
          artifact={{
            ...artifact,
            contentType: "text/plain",
            filename: "README.md",
          }}
          loadPreview={async () => ({
            contentType: "text/plain",
            filename: "README.md",
            previewKind: "text",
            url: "https://signed.example/README.md",
          })}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(
      await screen.findByRole("heading", { name: "Rendered heading" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Readable paragraph.")).toBeInTheDocument();
  });

  it("auto-loads available content in standalone mode", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("# Standalone reader", {
            headers: { "content-type": "text/markdown" },
            status: 200,
          }),
      ),
    );

    render(
      <TooltipProvider>
        <ArtifactViewerShell
          artifact={{
            ...artifact,
            contentType: "text/markdown",
            filename: "preview.md",
          }}
          autoLoad
          loadPreview={async () => ({
            contentType: "text/markdown",
            filename: "preview.md",
            url: "https://signed.example/preview.md",
          })}
          standalone
        />
      </TooltipProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Standalone reader" }),
    ).toBeInTheDocument();
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
