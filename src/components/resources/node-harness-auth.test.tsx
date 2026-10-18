/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NodeHarnessAuth } from "./node-harness-auth";
const mocks = vi.hoisted(() => ({
  commandHarnessAuth: vi.fn(),
  getHarnessAuth: vi.fn(),
}));
vi.mock("@/features/api/harness-auth", async () => ({
  ...(await vi.importActual("@/features/api/harness-auth")),
  ...mocks,
}));
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <NodeHarnessAuth
        userId="user1"
        node={{
          node_id: "node1",
          hostname: "fixture",
          online: true,
          os: "darwin",
          arch: "arm64",
        }}
      />
    </QueryClientProvider>,
  );
  return client;
}
it("recovers a prompt by command id without restarting login and keeps its secret out of mutation storage", async () => {
  localStorage.setItem(
    "harness-auth-v1:user1:node1",
    JSON.stringify({ harness: "pi", command_id: "start1" }),
  );
  mocks.getHarnessAuth.mockResolvedValue({
    harness: "pi",
    session_id: "attempt1",
    state: "awaiting_input",
    prompt: {
      version: 1,
      type: "prompt",
      id: "prompt2",
      kind: "secret",
      message: "Native key",
    },
  });
  mocks.commandHarnessAuth.mockResolvedValue({
    harness: "pi",
    session_id: "attempt1",
    state: "running",
  });
  const client = mount();
  await screen.findByLabelText("Authentication input");
  expect(mocks.commandHarnessAuth).not.toHaveBeenCalled();
  expect(mocks.getHarnessAuth).toHaveBeenCalledWith("user1", "node1", {
    harness: "pi",
    command_id: "start1",
  });
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText("Authentication input"),
    "fixture-private-key",
  );
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await waitFor(() => expect(mocks.commandHarnessAuth).toHaveBeenCalledOnce());
  expect(mocks.commandHarnessAuth.mock.calls[0][2]).toMatchObject({
    operation: "submit",
    session_id: "attempt1",
    prompt_id: "prompt2",
    code: "fixture-private-key",
  });
  expect(
    JSON.stringify([
      ...client
        .getMutationCache()
        .getAll()
        .map((m) => m.state.variables),
    ]),
  ).not.toContain("fixture-private-key");
  expect(JSON.stringify(localStorage)).not.toContain("fixture-private-key");
});
it("keeps a disconnected attempt recoverable without claiming completion or allowing it to be discarded", async () => {
  localStorage.setItem(
    "harness-auth-v1:user1:node1",
    JSON.stringify({
      harness: "codex",
      command_id: "start1",
      session_id: "attempt1",
    }),
  );
  mocks.getHarnessAuth.mockRejectedValue(new Error("Node disconnected"));
  mount();
  await screen.findByText("Node disconnected");
  expect(
    screen.queryByText("Authentication state: succeeded"),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Start again" }),
  ).not.toBeInTheDocument();
  expect(mocks.commandHarnessAuth).not.toHaveBeenCalled();
  expect(localStorage.getItem("harness-auth-v1:user1:node1")).toContain(
    "attempt1",
  );
});
it("does not turn a native javascript notice into a clickable link", async () => {
  localStorage.setItem(
    "harness-auth-v1:user1:node1",
    JSON.stringify({ harness: "pi", command_id: "start1" }),
  );
  mocks.getHarnessAuth.mockResolvedValue({
    harness: "pi",
    session_id: "attempt1",
    state: "running",
    events: [
      {
        version: 1,
        type: "notice",
        url: "javascript:alert(1)",
        message: "Native notice",
      },
    ],
  });
  mount();
  await screen.findByText("Native notice");
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});
it("directs TTY-only native flows to local login without attempting a broken web login", async () => {
  mount();
  const user = userEvent.setup();
  await user.selectOptions(
    screen.getByLabelText("Authentication harness"),
    "opencode",
  );
  expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  expect(
    screen.getByText(/This native flow needs a terminal/),
  ).toBeInTheDocument();
  expect(mocks.commandHarnessAuth).not.toHaveBeenCalled();
});
