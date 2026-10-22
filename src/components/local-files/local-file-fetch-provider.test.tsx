/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ApiError } from "@/features/api/errors";
import { MarkdownMessage } from "@/components/ui/markdown-message";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useLocalFileFetchStore } from "@/features/local-files/local-file-fetch-store";
import { LocalFileFetchProvider } from "./local-file-fetch-provider";

type ApiCall = { method: string; path: string; body?: unknown };

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

vi.mock("@/features/api/client", () => ({
  API_BASE_URL: "/api/pax",
  apiFetch: mocks.apiFetch,
  userPath: (userId: string, path: string) => `/api/v1/user/${userId}${path}`,
}));

vi.mock("mermaid", () => ({
  default: { initialize: vi.fn(), render: vi.fn() },
}));

const PATH = "/Users/me/proj/out/report.md";
const CHECK_URL = `/api/v1/user/user_1/sessions/sess_1/artifact-fetches/check?path=${encodeURIComponent(PATH)}`;
const FETCH_URL = "/api/v1/user/user_1/sessions/sess_1/artifact-fetches";
const PUBLICATION_URL = "/api/v1/user/user_1/artifact-publications/pub_1";

let calls: ApiCall[] = [];
let routes: Record<string, (call: ApiCall) => unknown>;

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("network disabled in tests");
    }),
  );
});

afterAll(() => vi.unstubAllGlobals());

beforeEach(() => {
  calls = [];
  routes = {};
  useLocalFileFetchStore.setState({ fetched: {} });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn(async () => undefined) },
  });
  mocks.apiFetch.mockImplementation(
    async (path: string, init?: RequestInit) => {
      const call: ApiCall = {
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        method: init?.method ?? "GET",
        path,
      };
      calls.push(call);
      const handler = routes[`${call.method} ${path}`];
      if (!handler) {
        throw new Error(`Unexpected API call ${call.method} ${path}`);
      }
      return handler(call);
    },
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderSession({ enabled = true }: { enabled?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LocalFileFetchProvider
          disabledReason={
            enabled
              ? undefined
              : "Fetching is unavailable for end-to-end encrypted sessions"
          }
          enabled={enabled}
          sessionId="sess_1"
          userId="user_1"
        >
          <MarkdownMessage content={`Wrote [report.md](${PATH}:12).`} />
        </LocalFileFetchProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

function allowCheck() {
  routes[`GET ${CHECK_URL}`] = () => ({
    allowed: true,
    filename: "report.md",
    path: PATH,
    size_bytes: 2048,
  });
}

function publication(status: string, extra: Record<string, unknown> = {}) {
  return {
    publication_id: "pub_1",
    filename: "report.md",
    origin: "user_fetch",
    session_id: "sess_1",
    status,
    ...extra,
  };
}

async function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "report.md" }));
  return screen.findByRole("dialog");
}

describe("LocalFileFetchProvider", () => {
  it("checks, confirms, uploads, and opens the fetched file in the viewer", async () => {
    allowCheck();
    routes[`POST ${FETCH_URL}`] = () => ({
      accepted: true,
      publication: publication("queued"),
    });
    let publicationReads = 0;
    routes[`GET ${PUBLICATION_URL}`] = () => {
      publicationReads += 1;
      return {
        publication:
          publicationReads === 1
            ? publication("uploading")
            : publication("available"),
      };
    };

    renderSession();
    const dialog = await openDialog();

    expect(within(dialog).getByText(/Checking/)).toBeInTheDocument();
    expect(
      await within(dialog).findByText(
        "This file is on the agent's machine. Fetch it to view it here.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(PATH)).toHaveClass("font-mono");
    expect(within(dialog).getByText("2.0 KB")).toBeInTheDocument();
    expect(within(dialog).getByText(/Artifacts panel/)).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Copy path" }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Fetch and open" }),
    );

    expect(await within(dialog).findByText("Uploading…")).toBeInTheDocument();
    expect(calls).toContainEqual({
      body: { path: PATH },
      method: "POST",
      path: FETCH_URL,
    });

    expect(
      await within(dialog).findByRole(
        "region",
        { name: "Artifact viewer: report.md" },
        { timeout: 4000 },
      ),
    ).toBeInTheDocument();

    // Reopening the same path offers the fetched copy.
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    const reopened = await openDialog();
    expect(
      within(reopened).getByRole("button", {
        name: /^Open fetched copy \(fetched \d{2}:\d{2}\)$/,
      }),
    ).toBeInTheDocument();
    expect(
      within(reopened).getByRole("button", { name: "Fetch again" }),
    ).toBeInTheDocument();
  }, 10_000);

  it("shows the mapped denial and no fetch button when check denies the path", async () => {
    routes[`GET ${CHECK_URL}`] = () => ({
      allowed: false,
      denial: {
        code: "owner_only_denied",
        message: "mode 0600",
        rule: "fs.owner_only",
      },
      filename: "report.md",
      path: PATH,
    });

    renderSession();
    const dialog = await openDialog();

    expect(
      await within(dialog).findByText(/readable only by its owner/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(`chmod 644 ${PATH}`, { exact: false }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("fs.owner_only")).toBeInTheDocument();
    expect(within(dialog).getByText(PATH)).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Fetch and open" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Copy path" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getAllByRole("button", { name: "Close" }).length,
    ).toBeGreaterThan(0);
  });

  it("falls back to the server message for unknown denial codes", async () => {
    routes[`GET ${CHECK_URL}`] = () => ({
      allowed: false,
      denial: {
        code: "brand_new_rule",
        message: "Server says no.",
        rule: "x.y",
      },
      filename: "report.md",
      path: PATH,
    });

    renderSession();
    const dialog = await openDialog();
    expect(
      await within(dialog).findByText("Server says no."),
    ).toBeInTheDocument();
  });

  it("shows the denial when the POST is not accepted", async () => {
    allowCheck();
    routes[`POST ${FETCH_URL}`] = () => ({
      accepted: false,
      denial: {
        code: "credential_path_denied",
        message: "looks like a key",
        rule: "fs.credential",
      },
    });

    renderSession();
    const dialog = await openDialog();
    fireEvent.click(
      await within(dialog).findByRole("button", { name: "Fetch and open" }),
    );

    expect(
      await within(dialog).findByText(/credential or key file/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("fs.credential")).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Fetch and open" }),
    ).not.toBeInTheDocument();
  });

  it("explains a secret_detected upload failure", async () => {
    allowCheck();
    routes[`POST ${FETCH_URL}`] = () => ({
      accepted: true,
      publication: publication("queued"),
    });
    routes[`GET ${PUBLICATION_URL}`] = () => ({
      publication: publication("failed", {
        error_code: "secret_detected",
        error_message: "AWS access key on line 3",
      }),
    });

    renderSession();
    const dialog = await openDialog();
    fireEvent.click(
      await within(dialog).findByRole("button", { name: "Fetch and open" }),
    );

    expect(
      await within(dialog).findByText(
        "A possible secret was found in this file (AWS access key on line 3), so the upload was blocked.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Copy path" }),
    ).toBeInTheDocument();
    expect(useLocalFileFetchStore.getState().fetched).toEqual({
      "user_1:sess_1": {},
    });
  });

  it.each([
    [503, "The agent's machine is offline."],
    [409, "Fetching is unavailable for end-to-end encrypted sessions."],
    [404, "Couldn't reach the file fetch service (HTTP 404)."],
  ])("maps HTTP %s from check to friendly text", async (status, text) => {
    routes[`GET ${CHECK_URL}`] = () => {
      throw new ApiError("boom", status, null);
    };

    renderSession();
    const dialog = await openDialog();
    expect(await within(dialog).findByText(text)).toBeInTheDocument();
  });

  it("keeps the link inert but copyable when the session disables fetching", () => {
    renderSession({ enabled: false });

    expect(
      screen.queryByRole("button", { name: "report.md" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("report.md"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(calls).toEqual([]);
    expect(
      screen.getByRole("button", { name: "Copy path" }),
    ).toBeInTheDocument();
  });
});
