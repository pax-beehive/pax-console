/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@/features/api/errors";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AgentSignInSettings } from "./agent-sign-in-settings";

const mocks = vi.hoisted(() => ({
  useNodes: vi.fn(),
  getNodeHarnessAuth: vi.fn(),
  loginNodeHarness: vi.fn(),
}));
vi.mock("@/features/api/resources", () => mocks);

const authorizationUrl =
  "https://claude.ai/oauth/authorize?state=fixture&code_challenge=fixture&response_type=code";
const awaitingCode = {
  harness: "claude",
  state: "awaiting_code",
  session_id: "login-one",
  authorization_url: authorizationUrl,
};
const nodes = [
  { node_id: "node-one", hostname: "Laptop", online: true },
  { node_id: "node-two", hostname: "Server", online: true },
  { node_id: "offline", hostname: "Offline", online: false },
  { node_id: "cli", hostname: "CLI identity", kind: "paxl", online: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useNodes.mockReturnValue({ data: { nodes }, refetch: vi.fn() });
  mocks.getNodeHarnessAuth.mockResolvedValue({
    harness_auth: { harness: "claude", state: "logged_out", logged_in: false },
  });
  mocks.loginNodeHarness.mockResolvedValue({ harness_auth: awaitingCode });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function mount(props: Partial<Parameters<typeof AgentSignInSettings>[0]> = {}) {
  return render(
    <TooltipProvider>
      <AgentSignInSettings userId="self" initialNodeId="node-one" {...props} />
    </TooltipProvider>,
  );
}

it("preselects exactly the linked device and checks without starting a login", async () => {
  mount({ initialNodeId: "node-two", returnSessionId: "conversation/one" });
  await screen.findByText("Not signed in on this device.");
  expect(screen.getByLabelText("Device")).toHaveValue("node-two");
  expect(screen.getByLabelText("Sign-in method")).toHaveValue("subscription");
  expect(mocks.getNodeHarnessAuth).toHaveBeenCalledWith(
    "self",
    "node-two",
    "claude",
    undefined,
    expect.any(AbortSignal),
  );
  expect(mocks.loginNodeHarness).not.toHaveBeenCalled();
  expect(
    screen.getByRole("link", { name: "Return to session" }),
  ).toHaveAttribute("href", "/?session_id=conversation%2Fone");
  expect(
    screen.queryByRole("option", { name: "CLI identity" }),
  ).not.toBeInTheDocument();
});

it("never falls back from a missing or offline linked device to another device", async () => {
  const first = mount({ initialNodeId: "missing" });
  expect(
    screen.getByText(/This device is unavailable to your account/),
  ).toBeInTheDocument();
  expect(mocks.getNodeHarnessAuth).not.toHaveBeenCalled();
  first.unmount();
  mount({ initialNodeId: "offline" });
  expect(screen.getByText(/This device is offline/)).toBeInTheDocument();
  expect(mocks.getNodeHarnessAuth).not.toHaveBeenCalled();
  expect(mocks.loginNodeHarness).not.toHaveBeenCalled();
});

it.each(["subscription", "console"])(
  "completes Claude %s with the full code and an internal login handle",
  async (method) => {
    const user = userEvent.setup();
    mount({ returnSessionId: "original-conversation" });
    await screen.findByText("Not signed in on this device.");
    await user.selectOptions(screen.getByLabelText("Sign-in method"), method);
    mocks.getNodeHarnessAuth.mockResolvedValue({ harness_auth: awaitingCode });
    await user.click(screen.getByRole("button", { name: "Start sign-in" }));
    const link = await screen.findByRole("link", {
      name: "Open Claude authorization",
    });
    expect(link).toHaveAttribute("href", authorizationUrl);
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(mocks.loginNodeHarness.mock.calls[0][3]).toMatchObject({
      operation: "start",
      method,
    });
    const code = screen.getByLabelText("Full authorization code");
    expect(code).toHaveAttribute("type", "password");
    await user.type(code, "complete-code#state-suffix");
    mocks.loginNodeHarness.mockResolvedValue({
      harness_auth: {
        harness: "claude",
        state: "succeeded",
        logged_in: true,
        session_id: "login-one",
      },
    });
    mocks.getNodeHarnessAuth.mockResolvedValue({
      harness_auth: {
        harness: "claude",
        state: "succeeded",
        logged_in: true,
        session_id: "login-one",
      },
    });
    await user.click(screen.getByRole("button", { name: "Complete sign-in" }));
    await screen.findByText("Signed in on this device.");
    expect(mocks.loginNodeHarness.mock.calls[1][3]).toMatchObject({
      operation: "submit",
      session_id: "login-one",
      code: "complete-code#state-suffix",
    });
    expect(mocks.loginNodeHarness.mock.calls[1][3]).not.toHaveProperty(
      "method",
    );
    expect(mocks.loginNodeHarness.mock.calls[1][3].session_id).not.toBe(
      "original-conversation",
    );
    expect(
      screen.queryByLabelText("Full authorization code"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Open Claude authorization" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Existing agent processes may need to be restarted/),
    ).toBeInTheDocument();
  },
);

it("shows Codex device instructions and waits for browser completion without a code POST", async () => {
  const user = userEvent.setup();
  mount({ initialHarness: "codex" });
  await screen.findByText("Not signed in on this device.");
  const challenge = {
    harness: "codex",
    state: "awaiting_browser",
    session_id: "device-login",
    authorization_url: "https://auth.openai.com/codex/device",
    user_code: "ABCD-EFGH",
    method: "device",
  };
  mocks.loginNodeHarness.mockResolvedValue({ harness_auth: challenge });
  mocks.getNodeHarnessAuth.mockResolvedValue({ harness_auth: challenge });
  await user.click(screen.getByRole("button", { name: "Start sign-in" }));
  await screen.findByText("ABCD-EFGH");
  expect(
    screen.getByRole("link", { name: "Open Codex authorization" }),
  ).toHaveAttribute("href", "https://auth.openai.com/codex/device");
  expect(
    screen.queryByLabelText("Full authorization code"),
  ).not.toBeInTheDocument();
  expect(mocks.loginNodeHarness.mock.calls[0][3]).toMatchObject({
    operation: "start",
    method: "device",
  });
  expect(mocks.loginNodeHarness).toHaveBeenCalledOnce();
});

it.each([
  ["api-key", "API key"],
  ["access-token", "Access token"],
])(
  "submits Codex %s only with an explicit start and immediately clears the secret",
  async (method, label) => {
    const user = userEvent.setup();
    mount({ initialHarness: "codex" });
    await screen.findByText("Not signed in on this device.");
    await user.selectOptions(screen.getByLabelText("Sign-in method"), method);
    const secret = screen.getByLabelText(label);
    expect(secret).toHaveAttribute("type", "password");
    expect(secret).toHaveAttribute("autocomplete", "off");
    await user.type(secret, "private-value");
    expect(mocks.loginNodeHarness).not.toHaveBeenCalled();
    let reject!: (error: Error) => void;
    mocks.loginNodeHarness.mockReturnValue(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    await user.click(screen.getByRole("button", { name: "Start sign-in" }));
    expect(secret).toHaveValue("");
    expect(mocks.loginNodeHarness.mock.calls[0][3]).toMatchObject({
      operation: "start",
      method,
      code: "private-value",
    });
    await act(async () => {
      reject(new Error("private-value must never be displayed"));
    });
    await screen.findByText(/Could not contact the device/);
    expect(screen.queryByText(/private-value/)).not.toBeInTheDocument();
    expect(secret).toHaveValue("");
  },
);

it("cancels a pending login and can start a fresh attempt after expiration", async () => {
  mocks.getNodeHarnessAuth.mockResolvedValue({ harness_auth: awaitingCode });
  const user = userEvent.setup();
  mount();
  await screen.findByLabelText("Full authorization code");
  mocks.loginNodeHarness.mockResolvedValue({
    harness_auth: { ...awaitingCode, state: "cancelled" },
  });
  mocks.getNodeHarnessAuth.mockResolvedValue({
    harness_auth: { ...awaitingCode, state: "cancelled" },
  });
  await user.click(screen.getByRole("button", { name: "Cancel sign-in" }));
  await screen.findByText("Sign-in was cancelled.");
  expect(
    screen.queryByRole("link", { name: "Open Claude authorization" }),
  ).not.toBeInTheDocument();
  expect(mocks.loginNodeHarness.mock.calls[0][3]).toMatchObject({
    operation: "cancel",
    session_id: "login-one",
  });
  mocks.loginNodeHarness.mockResolvedValue({
    harness_auth: { harness: "claude", state: "expired" },
  });
  mocks.getNodeHarnessAuth.mockResolvedValue({
    harness_auth: { harness: "claude", state: "expired" },
  });
  await user.click(screen.getByRole("button", { name: "Start sign-in" }));
  await screen.findByText(
    "Sign-in expired. Start again to get a new authorization link or code.",
  );
  expect(screen.getByRole("button", { name: "Start sign-in" })).toBeEnabled();
});

it("reports unavailable remote login without showing the API error body", async () => {
  mocks.getNodeHarnessAuth.mockRejectedValue(
    new ApiError("secret response", 404, {}),
  );
  mount();
  await screen.findByText(/Remote sign-in is unavailable/);
  expect(screen.queryByText(/secret response/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start sign-in" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Refresh status" })).toBeEnabled();
});

it("rejects untrusted provider URLs instead of rendering an authorization link", async () => {
  mocks.getNodeHarnessAuth.mockResolvedValue({
    harness_auth: {
      ...awaitingCode,
      authorization_url: "https://claude.ai.evil.test/oauth/authorize",
    },
  });
  mount();
  await screen.findByText(/unsupported authorization link/);
  expect(
    screen.queryByRole("link", { name: "Open Claude authorization" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText("Full authorization code"),
  ).not.toBeInTheDocument();
});

it("polls the login handle after an accepted start and stops after success", async () => {
  vi.useFakeTimers();
  mocks.getNodeHarnessAuth.mockResolvedValueOnce({
    harness_auth: {
      harness: "claude",
      state: "starting",
      session_id: "login-one",
    },
  });
  mocks.getNodeHarnessAuth.mockResolvedValue({
    harness_auth: {
      harness: "claude",
      state: "succeeded",
      session_id: "login-one",
      logged_in: true,
    },
  });
  mount();
  await act(async () => {
    await Promise.resolve();
  });
  expect(
    screen.getByText("Starting sign-in on the device…"),
  ).toBeInTheDocument();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(screen.getByText("Signed in on this device.")).toBeInTheDocument();
  expect(mocks.getNodeHarnessAuth).toHaveBeenLastCalledWith(
    "self",
    "node-one",
    "claude",
    "login-one",
    expect.any(AbortSignal),
  );
  const calls = mocks.getNodeHarnessAuth.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000);
  });
  expect(mocks.getNodeHarnessAuth).toHaveBeenCalledTimes(calls);
});

it("keeps reauthentication available when local credentials still report logged in", async () => {
  mocks.getNodeHarnessAuth.mockResolvedValue({
    harness_auth: { harness: "claude", state: "logged_in", logged_in: true },
  });
  const user = userEvent.setup();
  mount();
  await screen.findByText("Signed in on this device.");
  expect(screen.getByRole("button", { name: "Sign in again" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Sign in again" }));
  expect(mocks.loginNodeHarness).toHaveBeenCalledOnce();
});

it("reconciles the latest status after a login handle disappears", async () => {
  mocks.getNodeHarnessAuth.mockResolvedValueOnce({
    harness_auth: awaitingCode,
  });
  mocks.getNodeHarnessAuth.mockRejectedValue(
    new ApiError("not found", 404, {}),
  );
  const user = userEvent.setup();
  mount();
  await screen.findByLabelText("Full authorization code");
  await user.click(screen.getByRole("button", { name: "Refresh status" }));
  await screen.findByText(/Remote sign-in is unavailable/);
  mocks.getNodeHarnessAuth.mockResolvedValue({
    harness_auth: { harness: "claude", state: "logged_out" },
  });
  await user.click(screen.getByRole("button", { name: "Refresh status" }));
  await screen.findByText("Not signed in on this device.");
  expect(mocks.getNodeHarnessAuth).toHaveBeenLastCalledWith(
    "self",
    "node-one",
    "claude",
    undefined,
    expect.any(AbortSignal),
  );
});

it("discards a late response after selecting a different device", async () => {
  let resolve!: (value: unknown) => void;
  mocks.getNodeHarnessAuth.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const user = userEvent.setup();
  mount();
  await user.selectOptions(screen.getByLabelText("Device"), "node-two");
  await screen.findByText("Not signed in on this device.");
  await act(async () => {
    resolve({ harness_auth: awaitingCode });
  });
  expect(
    screen.queryByRole("link", { name: "Open Claude authorization" }),
  ).not.toBeInTheDocument();
  expect(mocks.getNodeHarnessAuth.mock.calls[0][4].aborted).toBe(true);
});

it("removes an expired challenge even if the device cannot be contacted", async () => {
  vi.useFakeTimers();
  mocks.getNodeHarnessAuth.mockResolvedValueOnce({
    harness_auth: {
      ...awaitingCode,
      expires_at: new Date(Date.now() + 1000).toISOString(),
    },
  });
  mocks.getNodeHarnessAuth.mockRejectedValue(new Error("offline"));
  mount();
  await act(async () => {
    await Promise.resolve();
  });
  expect(
    screen.getByRole("link", { name: "Open Claude authorization" }),
  ).toBeInTheDocument();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(
    screen.queryByRole("link", { name: "Open Claude authorization" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText("Full authorization code"),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Sign-in expired/)).toBeInTheDocument();
});

it("recovers an ambiguously accepted start through status without starting a duplicate login", async () => {
  const user = userEvent.setup();
  mount();
  await screen.findByText("Not signed in on this device.");
  mocks.loginNodeHarness.mockRejectedValue(new ApiError("timeout", 504, {}));
  await user.click(screen.getByRole("button", { name: "Start sign-in" }));
  await screen.findByText(/The device did not respond in time/);
  mocks.getNodeHarnessAuth.mockResolvedValue({ harness_auth: awaitingCode });
  await user.click(screen.getByRole("button", { name: "Refresh status" }));
  await screen.findByLabelText("Full authorization code");
  expect(mocks.loginNodeHarness).toHaveBeenCalledOnce();
  expect(mocks.getNodeHarnessAuth).toHaveBeenLastCalledWith(
    "self",
    "node-one",
    "claude",
    undefined,
    expect.any(AbortSignal),
  );
});
