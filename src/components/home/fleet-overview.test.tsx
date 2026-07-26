/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { User } from "@/features/api/types";
import { FleetOverview } from "./fleet-overview";

const mocks = vi.hoisted(() => ({
  completeUserAttachment: vi.fn(),
  createUserAttachment: vi.fn(),
  listAgents: vi.fn(),
  listUserSessions: vi.fn(),
  routerPush: vi.fn(),
  uploadUserAttachmentFile: vi.fn(),
  useApprovals: vi.fn(),
  useEnvelopes: vi.fn(),
  useNodes: vi.fn(),
  useTeamInvites: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.routerPush }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock("@/components/shell/console-layout", () => ({
  ConsoleLayout: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/sessions/session-workbench", () => ({
  SessionWorkbench: ({
    agentId,
    embedded,
    initialAttachments,
    initialPrompt,
    nodeId,
    sessionId,
  }: {
    agentId?: string;
    embedded?: boolean;
    initialAttachments?: Array<{ attachmentId: string }>;
    initialPrompt?: string;
    nodeId?: string;
    sessionId: string;
  }) => (
    <div
      data-agent-id={agentId}
      data-embedded={String(Boolean(embedded))}
      data-initial-attachments={initialAttachments
        ?.map((attachment) => attachment.attachmentId)
        .join(",")}
      data-initial-prompt={initialPrompt}
      data-node-id={nodeId}
      data-testid="session-workbench"
    >
      {sessionId}
    </div>
  ),
}));

vi.mock("@/features/api/resources", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/api/resources")>();
  return {
    ...actual,
    completeUserAttachment: mocks.completeUserAttachment,
    createUserAttachment: mocks.createUserAttachment,
    listAgents: mocks.listAgents,
    listUserSessions: mocks.listUserSessions,
    uploadUserAttachmentFile: mocks.uploadUserAttachmentFile,
    useApprovals: mocks.useApprovals,
    useEnvelopes: mocks.useEnvelopes,
    useNodes: mocks.useNodes,
    useTeamInvites: mocks.useTeamInvites,
  };
});

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  mocks.completeUserAttachment.mockReset();
  mocks.createUserAttachment.mockReset();
  mocks.routerPush.mockReset();
  mocks.uploadUserAttachmentFile.mockReset();
  mocks.createUserAttachment.mockResolvedValue({
    attachment: {
      attachment_id: "att_1",
      content_type: "text/plain",
      filename: "notes.txt",
      size_bytes: 5,
    },
    upload: {
      headers: {},
      method: "POST",
      url: "https://upload.example.test",
    },
  });
  mocks.uploadUserAttachmentFile.mockResolvedValue(undefined);
  mocks.completeUserAttachment.mockResolvedValue({
    attachment: {
      attachment_id: "att_1",
      content_type: "text/plain",
      filename: "notes.txt",
      size_bytes: 5,
    },
  });
  mocks.listAgents.mockResolvedValue({
    agents: [
      {
        agent_id: "agent_1",
        name: "Pi agent",
        node_id: "node_1",
        online: true,
      },
    ],
  });
  mocks.listUserSessions.mockResolvedValue({
    pagination: { page_num: 1, page_size: 20, total: 1, total_pages: 1 },
    sessions: [
      {
        agent_id: "agent_1",
        name: "Session one",
        node_id: "node_1",
        session_id: "sess_1",
        updated_at: "2026-07-20T12:00:00.000Z",
      },
    ],
  });
  mocks.useNodes.mockReturnValue({
    data: {
      nodes: [{ name: "Development Mac", node_id: "node_1", online: true }],
    },
    error: null,
    isLoading: false,
  });
  mocks.useApprovals.mockReturnValue(emptyQueryData("approvals"));
  mocks.useEnvelopes.mockReturnValue(emptyQueryData("envelopes"));
  mocks.useTeamInvites.mockReturnValue(emptyQueryData("invites"));
});

afterEach(() => cleanup());

describe("FleetOverview session rail", () => {
  it("keeps Home mounted and opens a selected session in the embedded workbench", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <FleetOverview user={{ user_id: "user_1" } as User} />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Session one/ }));

    const workbench = await screen.findByTestId("session-workbench");
    expect(workbench).toHaveTextContent("sess_1");
    expect(workbench).toHaveAttribute("data-embedded", "true");
    expect(workbench).toHaveAttribute("data-node-id", "node_1");
    expect(workbench).toHaveAttribute("data-agent-id", "agent_1");
    expect(screen.getAllByText("Sessions").length).toBeGreaterThan(0);
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("?sessionId=sess_1");
    await waitFor(() => expect(mocks.routerPush).not.toHaveBeenCalled());
  });

  it("starts a new chat inside Home without navigating to the session route", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <FleetOverview user={{ user_id: "user_1" } as User} />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    const composer = await screen.findByPlaceholderText(
      "Ask an agent to do something",
    );
    fireEvent.change(composer, {
      target: { value: "Keep this chat on Home" },
    });
    fireEvent.submit(composer.closest("form")!);

    const workbench = await screen.findByTestId("session-workbench");
    expect(workbench).toHaveTextContent("new");
    expect(workbench).toHaveAttribute("data-embedded", "true");
    expect(workbench).toHaveAttribute(
      "data-initial-prompt",
      "Keep this chat on Home",
    );
    expect(screen.getAllByText("Sessions").length).toBeGreaterThan(0);
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("");
    expect(mocks.routerPush).not.toHaveBeenCalled();
  });

  it("uploads files from the Home composer and forwards them to the new session", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <FleetOverview user={{ user_id: "user_1" } as User} />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("button", { name: "Attach files" }),
    ).toBeInTheDocument();
    const fileInput = container.querySelector<HTMLInputElement>(
      'input[type="file"][multiple]',
    );
    expect(fileInput).not.toBeNull();
    const file = new File(["notes"], "notes.txt", { type: "text/plain" });
    fireEvent.change(fileInput!, { target: { files: [file] } });

    expect(await screen.findByText("notes.txt")).toBeInTheDocument();
    expect(mocks.createUserAttachment).toHaveBeenCalledWith("user_1", {
      content_type: "text/plain",
      filename: "notes.txt",
      sha256: "",
      size_bytes: 5,
    });
    expect(mocks.uploadUserAttachmentFile).toHaveBeenCalledWith(
      expect.objectContaining({
        attachment: expect.objectContaining({ attachment_id: "att_1" }),
      }),
      file,
    );

    const composer = screen.getByPlaceholderText(
      "Ask an agent to do something",
    );
    fireEvent.change(composer, {
      target: { value: "Read the attachment" },
    });
    fireEvent.submit(composer.closest("form")!);

    const workbench = await screen.findByTestId("session-workbench");
    expect(workbench).toHaveAttribute("data-initial-attachments", "att_1");
    expect(workbench).toHaveAttribute(
      "data-initial-prompt",
      "Read the attachment",
    );
  });
});

function emptyQueryData(key: string) {
  return {
    data: { [key]: [] },
    error: null,
    isLoading: false,
  };
}
