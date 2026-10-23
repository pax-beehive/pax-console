/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import Link from "next/link";
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ARTIFACT_PREVIEW_BUDGET } from "./artifact-preview-data";
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

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("ArtifactViewerShell", () => {
  it.each([
    { standalone: false, sourceType: "session_artifact" as const },
    { standalone: true, sourceType: "session_artifact" as const },
    { standalone: false, sourceType: "publication" as const },
    { standalone: true, sourceType: "publication" as const },
  ])(
    "keeps $sourceType downloads in the current browser context (standalone=$standalone)",
    ({ standalone, sourceType }) => {
      const collection =
        sourceType === "session_artifact"
          ? "artifacts"
          : "artifact-publications";
      const downloadHref = `/api/pax/api/v1/user/self/${collection}/artifact_1/content/main?disposition=attachment&redirect=true`;
      render(
        <TooltipProvider>
          <ArtifactViewerShell
            artifact={{ ...artifact, sourceType, downloadHref }}
            standalone={standalone}
          />
        </TooltipProvider>,
      );

      const download = screen.getByRole("link", { name: "Download" });
      expect(download).toHaveAttribute("href", downloadHref);
      expect(download).toHaveAttribute("download");
      expect(download).toHaveAttribute("target", "_self");
      expect(download).toHaveAttribute("rel", "noreferrer");
    },
  );
  it("starts as a compact file card without an empty preview region", () => {
    render(
      <TooltipProvider>
        <ArtifactViewerShell artifact={artifact} loadPreview={vi.fn()} />
      </TooltipProvider>,
    );

    expect(screen.getByRole("button", { name: "Preview" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(
      screen.queryByRole("region", { name: "Artifact preview" }),
    ).toBeNull();
    expect(screen.queryByText(/Select Preview to load/)).toBeNull();
    expect(screen.queryByText("builtin:json")).toBeNull();
  });

  it("collapses and resumes the same content and scroll position without fetching again", async () => {
    const loadPreview = vi.fn(async () => ({
      url: "https://signed.example/result.json",
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"value":42}')),
    );
    render(
      <TooltipProvider>
        <ArtifactViewerShell artifact={artifact} loadPreview={loadPreview} />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByText("42");
    const region = screen.getByRole("region", { name: "Artifact preview" });
    region.scrollTop = 140;
    fireEvent.scroll(region);
    fireEvent.click(screen.getByRole("button", { name: "Collapse preview" }));
    expect(region).not.toBeVisible();
    expect(
      screen.getByRole("button", { name: "Expand preview" }),
    ).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Expand preview" }));
    expect(screen.getByRole("region", { name: "Artifact preview" })).toBe(
      region,
    );
    expect(region.scrollTop).toBe(140);
    expect(loadPreview).toHaveBeenCalledTimes(1);
  });

  it("closes a pending preview and ignores its late descriptor", async () => {
    let resolvePreview!: (value: { url: string }) => void;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <TooltipProvider>
        <ArtifactViewerShell
          artifact={artifact}
          loadPreview={() =>
            new Promise((resolve) => {
              resolvePreview = resolve;
            })
          }
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    await act(async () =>
      resolvePreview({ url: "https://signed.example/late" }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("region", { name: "Artifact preview" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Preview" })).toBeEnabled();
  });

  it("does not reopen when automatic loading was scheduled before closing", () => {
    let scheduled!: FrameRequestCallback;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      scheduled = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(
      () => undefined,
    );
    const loadPreview = vi.fn();
    render(
      <TooltipProvider>
        <ArtifactViewerShell
          artifact={artifact}
          autoLoad
          loadPreview={loadPreview}
        />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    act(() => scheduled(0));
    expect(loadPreview).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Preview" })).toBeVisible();
  });

  it("does not create a blob URL when an image response finishes after closing", async () => {
    let resolveResponse!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const createURL = vi.spyOn(URL, "createObjectURL");
    render(
      <TooltipProvider>
        <ArtifactViewerShell
          artifact={{
            ...artifact,
            contentType: "image/png",
            filename: "result.png",
          }}
          loadPreview={async () => ({ url: "https://signed.example/png" })}
        />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    await act(async () => resolveResponse(new Response(new Uint8Array([1]))));
    expect(createURL).not.toHaveBeenCalled();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("expands only one preview per session while retaining the other content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"value":42}')),
    );
    const loadPreview = vi.fn(async () => ({
      url: "https://signed.example/json",
    }));
    render(
      <TooltipProvider>
        {["First", "Second", "Other session"].map((title, index) => (
          <ArtifactViewerShell
            key={title}
            artifact={{ ...artifact, id: title, title }}
            loadPreview={loadPreview}
            previewScope={index < 2 ? "session-1" : "session-2"}
          />
        ))}
      </TooltipProvider>,
    );
    const first = within(screen.getByLabelText("Artifact viewer: First"));
    const second = within(screen.getByLabelText("Artifact viewer: Second"));
    const other = within(
      screen.getByLabelText("Artifact viewer: Other session"),
    );
    fireEvent.click(first.getByRole("button", { name: "Preview" }));
    await first.findByText("42");
    fireEvent.click(other.getByRole("button", { name: "Preview" }));
    await other.findByText("42");
    fireEvent.click(second.getByRole("button", { name: "Preview" }));
    await second.findByText("42");

    expect(
      first.queryByRole("region", { name: "Artifact preview" }),
    ).toBeNull();
    expect(
      other.getByRole("region", { name: "Artifact preview" }),
    ).toBeVisible();
    fireEvent.click(first.getByRole("button", { name: "Expand preview" }));
    expect(
      first.getByRole("region", { name: "Artifact preview" }),
    ).toBeVisible();
    expect(
      second.queryByRole("region", { name: "Artifact preview" }),
    ).toBeNull();
    expect(loadPreview).toHaveBeenCalledTimes(3);
  });

  it("keeps Escape scoped to the focused inline preview", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"value":42}')),
    );
    render(
      <TooltipProvider>
        <ArtifactViewerShell
          artifact={artifact}
          loadPreview={async () => ({ url: "https://signed.example/json" })}
        />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByText("42");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.getByRole("region", { name: "Artifact preview" }),
    ).toBeVisible();
    fireEvent.keyDown(screen.getByRole("button", { name: "Close preview" }), {
      key: "Escape",
    });
    expect(
      screen.queryByRole("region", { name: "Artifact preview" }),
    ).toBeNull();
  });

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
      {
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
      },
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
          navigation={<Link href="/sessions/source">Back to session</Link>}
        />
      </TooltipProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Standalone reader" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to session" }),
    ).toHaveAttribute("href", "/sessions/source");
    expect(screen.queryByText("available")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Result" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Artifact options" }),
    ).toBeInTheDocument();
  });

  it("copies the reader URL with its content reference, not a download URL", async () => {
    const user = userEvent.setup();
    window.history.replaceState(
      {},
      "",
      "/artifacts/files/artifact_1?ref=report",
    );
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(
      <TooltipProvider>
        <ArtifactViewerShell artifact={artifact} standalone />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Copy link" }));

    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(await screen.findByRole("status")).toHaveTextContent("Link copied");
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      "/download",
    );
  });

  it("reports clipboard failure and lets the user retry from the menu", async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockRejectedValueOnce(new Error("Permission denied"))
      .mockResolvedValueOnce();
    render(
      <TooltipProvider>
        <ArtifactViewerShell artifact={artifact} standalone />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Couldn't copy link",
    );
    await user.click(screen.getByRole("button", { name: "Artifact options" }));
    await user.click(screen.getByRole("menuitem", { name: "Copy link" }));

    expect(writeText).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("status")).toHaveTextContent("Link copied");
  });

  it("keeps file details in the menu and falls back to the filename", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <ArtifactViewerShell
          artifact={{
            ...artifact,
            title: "",
            sizeBytes: 1024,
            createdAt: "2026-09-17T12:00:00Z",
          }}
          standalone
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole("heading", { name: "result.json" })).toBeVisible();
    expect(screen.queryByText("1.0 KB")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Artifact options" }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByText("File details")).toBeInTheDocument();
    expect(within(menu).getByText("1.0 KB")).toBeInTheDocument();
    expect(within(menu).getByText("Created")).toBeInTheDocument();
    expect(within(menu).queryByText("result.json")).not.toBeInTheDocument();
  });

  it("opens and closes the fullscreen dialog without closing the inline preview", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"value":42}')),
    );
    render(
      <TooltipProvider>
        <ArtifactViewerShell
          artifact={artifact}
          loadPreview={async () => ({ url: "https://signed.example/json" })}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByText("42");
    fireEvent.click(
      screen.getByRole("button", { name: "Open artifact fullscreen" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Artifact viewer: Result" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Artifact preview" }),
    ).toBeVisible();
  });

  it("loads URL previews into a blob URL and revokes each object URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "image/png" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([4, 5, 6]), {
          headers: { "content-type": "image/png" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:pax-preview-1")
      .mockReturnValueOnce("blob:pax-preview-2");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const loadPreview = vi.fn(async () => ({
      contentType: "image/png",
      previewKind: "image" as const,
      url: "https://signed.example/image?X-Amz-Signature=top-secret",
    }));

    const { unmount } = render(
      <TooltipProvider>
        <ArtifactViewerShell
          artifact={{
            ...artifact,
            contentType: "image/png",
            filename: "result.png",
            sizeBytes: 3,
          }}
          loadPreview={loadPreview}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(await screen.findByRole("img", { name: "Result" })).toHaveAttribute(
      "src",
      "blob:pax-preview-1",
    );
    expect(screen.getByRole("link", { name: "Open file" })).toHaveAttribute(
      "href",
      "blob:pax-preview-1",
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://signed.example/image?X-Amz-Signature=top-secret",
      {
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
      },
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(2);
    });
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:pax-preview-1");

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:pax-preview-2");
  });

  it("shows image dimensions, retains zoom across collapse and fullscreen, and restores fit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new Uint8Array([1]), {
            headers: { "content-type": "application/octet-stream" },
          }),
      ),
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:generic-png");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const loadPreview = vi.fn(async () => ({
      contentType: "application/octet-stream",
      previewKind: "download" as const,
      url: "https://signed.example/result.png?signature=secret",
    }));
    render(
      <TooltipProvider>
        <ArtifactViewerShell
          artifact={{
            ...artifact,
            filename: "result.png",
            contentType: "application/octet-stream",
          }}
          loadPreview={loadPreview}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    const image = await screen.findByRole("img", { name: "Result" });
    Object.defineProperties(image, {
      naturalWidth: { value: 1600 },
      naturalHeight: { value: 1000 },
    });
    fireEvent.load(image);
    expect(screen.getByText("1600 × 1000")).toBeVisible();
    expect(image).toHaveClass("max-h-full", "max-w-full");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(image).toHaveStyle({ width: "2000px", height: "1250px" });
    fireEvent.click(screen.getByRole("button", { name: "Collapse preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand preview" }));
    expect(screen.getByRole("img")).toBe(image);
    expect(
      screen.getByRole("button", { name: "Show image at actual size" }),
    ).toHaveTextContent("125%");
    fireEvent.click(
      screen.getByRole("button", { name: "Open artifact fullscreen" }),
    );
    expect(screen.getByRole("img")).toHaveStyle({ width: "2000px" });
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Show image at actual size" }),
      { key: "Escape" },
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Show image at actual size" }),
    ).toHaveTextContent("125%");
    fireEvent.click(screen.getByRole("button", { name: "Fit image" }));
    expect(screen.getByRole("img")).toHaveClass("max-h-full", "max-w-full");
    expect(loadPreview).toHaveBeenCalledTimes(1);
  });

  it("offers retry and download when an image cannot be decoded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1]))),
    );
    vi.spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:broken")
      .mockReturnValueOnce("blob:retry");
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const loadPreview = vi.fn(async () => ({
      contentType: "image/png",
      url: "https://signed.example/png",
    }));
    render(
      <TooltipProvider>
        <ArtifactViewerShell
          artifact={{
            ...artifact,
            contentType: "image/png",
            filename: "result.png",
          }}
          loadPreview={loadPreview}
        />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    fireEvent.error(await screen.findByRole("img"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This image could not be displayed",
    );
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      "/download",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry preview" }));
    expect(await screen.findByRole("img")).toHaveAttribute("src", "blob:retry");
    expect(revoke).toHaveBeenCalledWith("blob:broken");
    expect(loadPreview).toHaveBeenCalledTimes(2);
  });

  it("releases a closed image, leaves its card, and fetches a fresh preview on reopen", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1]))),
    );
    vi.spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second");
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const loadPreview = vi.fn(async () => ({
      contentType: "image/png",
      url: "https://signed.example/png",
    }));
    render(
      <TooltipProvider>
        <ArtifactViewerShell
          artifact={{
            ...artifact,
            contentType: "image/png",
            filename: "result.png",
          }}
          autoLoad
          loadPreview={loadPreview}
        />
      </TooltipProvider>,
    );
    await screen.findByRole("img");
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    expect(revoke).toHaveBeenCalledWith("blob:first");
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("button", { name: "Preview" })).toHaveFocus();
    expect(loadPreview).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByRole("img")).toHaveAttribute(
      "src",
      "blob:second",
    );
  });

  it("resets preview content when its artifact identity changes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"value":42}')),
    );
    const loadPreview = vi.fn(async () => ({
      url: "https://signed.example/json",
    }));
    const { rerender } = render(
      <TooltipProvider>
        <ArtifactViewerShell artifact={artifact} loadPreview={loadPreview} />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByText("42");
    rerender(
      <TooltipProvider>
        <ArtifactViewerShell
          artifact={{ ...artifact, id: "another", title: "Another" }}
          loadPreview={loadPreview}
        />
      </TooltipProvider>,
    );
    expect(screen.queryByText("42")).toBeNull();
    expect(screen.getByRole("button", { name: "Preview" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("clears a previous session's preview when its scope changes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"value":42}')),
    );
    const loadPreview = async () => ({ url: "https://signed.example/json" });
    const { rerender } = render(
      <TooltipProvider>
        <ArtifactViewerShell
          artifact={artifact}
          loadPreview={loadPreview}
          previewScope="session-1"
        />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByText("42");
    rerender(
      <TooltipProvider>
        <ArtifactViewerShell
          artifact={artifact}
          loadPreview={loadPreview}
          previewScope="session-2"
        />
      </TooltipProvider>,
    );
    expect(screen.queryByText("42")).toBeNull();
    expect(screen.getByRole("button", { name: "Preview" })).toBeVisible();
  });

  it.each([
    ["application/pdf", "pdf", "result.pdf"],
    ["text/html", "html", "result.html"],
  ] as const)(
    "keeps the signed %s URL out of the preview frame",
    async (contentType, previewKind, filename) => {
      const signedUrl =
        "https://signed.example/file?X-Amz-Signature=top-secret";
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(new Uint8Array([1]), {
            headers: { "content-type": contentType },
          }),
        ),
      );
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pax-frame");
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
      const { container } = render(
        <TooltipProvider>
          <ArtifactViewerShell
            artifact={{ ...artifact, contentType, filename, sizeBytes: 1 }}
            loadPreview={async () => ({
              contentType,
              previewKind,
              url: signedUrl,
            })}
          />
        </TooltipProvider>,
      );

      fireEvent.click(screen.getByRole("button", { name: "Preview" }));

      await waitFor(() => {
        expect(container.querySelector("iframe")).toHaveAttribute(
          "src",
          "blob:pax-frame",
        );
      });
      expect(container.innerHTML).not.toContain(signedUrl);
      expect(container.innerHTML).not.toContain("top-secret");
    },
  );

  it.each([false, true])(
    "previews download-marked HTML with generic MIME (standalone=%s)",
    async (standalone) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response(
              '<html><body><script>document.body.textContent = "Rendered"</script></body></html>',
              { headers: { "content-type": "application/octet-stream" } },
            ),
          ),
      );
      const createObjectURL = vi
        .spyOn(URL, "createObjectURL")
        .mockReturnValue("blob:pax-html");
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
      const { container } = render(
        <TooltipProvider>
          <ArtifactViewerShell
            artifact={{
              ...artifact,
              filename: "result.html",
              contentType: "application/octet-stream",
            }}
            autoLoad={standalone}
            standalone={standalone}
            loadPreview={async () => ({
              previewKind: "download",
              contentType: "application/octet-stream",
              url: "https://signed.example/result.html",
            })}
          />
        </TooltipProvider>,
      );
      if (!standalone)
        fireEvent.click(screen.getByRole("button", { name: "Preview" }));
      await waitFor(() =>
        expect(container.querySelector("iframe")).toHaveAttribute(
          "src",
          "blob:pax-html",
        ),
      );
      expect(createObjectURL.mock.calls[0][0]).toMatchObject({
        type: "text/html",
      });
      expect(container.querySelector("iframe")).toHaveAttribute(
        "sandbox",
        "allow-scripts",
      );
    },
  );

  it("shows a stable error when the binary preview transport fails", async () => {
    const signedUrl = "https://signed.example/image?X-Amz-Signature=top-secret";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError(`Failed to fetch ${signedUrl}`)),
    );

    const { container } = render(
      <TooltipProvider>
        <ArtifactViewerShell
          artifact={{
            ...artifact,
            contentType: "image/png",
            filename: "result.png",
          }}
          loadPreview={async () => ({
            contentType: "image/png",
            previewKind: "image",
            url: signedUrl,
          })}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(
      await screen.findByText("Error: Preview request failed"),
    ).toBeInTheDocument();
    expect(container.innerHTML).not.toContain(signedUrl);
    expect(container.innerHTML).not.toContain("top-secret");
  });

  it("rejects a known oversized URL preview before requesting a descriptor", async () => {
    const loadPreview = vi.fn();

    render(
      <TooltipProvider>
        <ArtifactViewerShell
          artifact={{
            ...artifact,
            contentType: "application/pdf",
            filename: "large.pdf",
            sizeBytes: ARTIFACT_PREVIEW_BUDGET.maxBlobBytes + 1,
          }}
          loadPreview={loadPreview}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(
      await screen.findByText(
        /too large to preview safely.*download it instead/i,
      ),
    ).toBeInTheDocument();
    expect(loadPreview).not.toHaveBeenCalled();
  });
});
