/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import Link from "next/link";
import {
  cleanup,
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
