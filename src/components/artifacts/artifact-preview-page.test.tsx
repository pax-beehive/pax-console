/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ArtifactPreviewRoute } from "./artifact-preview-page";

const mocks = vi.hoisted(() => ({
  back: vi.fn(),
  useArtifact: vi.fn(),
  useArtifactPublication: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ back: mocks.back }) }));
vi.mock("@/features/auth/auth-gate", () => ({
  AuthGate: ({
    children,
  }: {
    children: (user: { user_id: string }) => ReactNode;
  }) => children({ user_id: "user_1" }),
}));
vi.mock("@/components/shell/console-layout", () => ({
  ConsoleLayout: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/features/api/resources", () => ({
  useArtifact: mocks.useArtifact,
  useArtifactPublication: mocks.useArtifactPublication,
  artifactContentDownloadHref: () => "/download",
  artifactPublicationContentDownloadHref: () => "/download",
  getArtifactContentURL: vi.fn(),
  getArtifactPublicationContent: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("artifact reader navigation", () => {
  it.each(["files", "publications"] as const)(
    "returns to the source session for %s without fetching its name",
    (sourceType) => {
      mocks.useArtifact.mockReturnValue({
        data: {
          artifact: {
            artifact_id: "artifact_1",
            title: "API Contract",
            status: "proposed",
            session_id: "session/one",
          },
        },
      });
      mocks.useArtifactPublication.mockReturnValue({
        data: {
          publication: {
            publication_id: "artifact_1",
            title: "API Contract",
            status: "queued",
            session_id: "session/one",
          },
        },
      });
      render(
        <TooltipProvider>
          <ArtifactPreviewRoute
            artifactId="artifact_1"
            contentRef="main"
            sourceType={sourceType}
          />
        </TooltipProvider>,
      );

      expect(
        screen.getByRole("link", { name: "Back to session" }),
      ).toHaveAttribute("href", "/sessions/session%2Fone");
      expect(
        screen.getByRole("heading", { name: "API Contract" }),
      ).toBeVisible();
      expect(
        screen.queryByRole("link", { name: "Download" }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("Processing");
    },
  );

  it("uses browser back when a file has no associated session", () => {
    mocks.useArtifact.mockReturnValue({
      data: {
        artifact: {
          artifact_id: "artifact_1",
          title: "API Contract",
          status: "failed",
        },
      },
    });
    mocks.useArtifactPublication.mockReturnValue({});
    render(
      <TooltipProvider>
        <ArtifactPreviewRoute
          artifactId="artifact_1"
          contentRef="main"
          sourceType="files"
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(mocks.back).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("Preview unavailable");
  });
});
