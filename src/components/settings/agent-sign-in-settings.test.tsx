/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@/features/api/errors";
import { useLocaleStore } from "@/features/i18n/locale-store";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  AgentSignInSettings,
  defaultSignInMethod,
} from "./agent-sign-in-settings";

const mocks = vi.hoisted(() => ({
  useNodes: vi.fn(),
  getNodeHarnessAuth: vi.fn(),
  loginNodeHarness: vi.fn(),
  useNodeHarnessUsage: vi.fn(),
  useNodeAgents: vi.fn(),
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
// Agents registered in PAX; the dropdown never probes devices.
const registeredAgents = ["node-one", "node-two"].flatMap((node_id) => [
  { agent_id: `${node_id}-claude`, node_id, agent_type: "claude-code" },
  { agent_id: `${node_id}-codex`, node_id, agent_type: "codex" },
]);

function agentsQuery(agents: unknown[] = registeredAgents) {
  return {
    data: { agents },
    error: null,
    isLoading: false,
    refetch: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useNodes.mockReturnValue({ data: { nodes }, refetch: vi.fn() });
  mocks.getNodeHarnessAuth.mockResolvedValue({
    harness_auth: { harness: "claude", state: "logged_out", logged_in: false },
  });
  mocks.loginNodeHarness.mockResolvedValue({ harness_auth: awaitingCode });
  mocks.useNodeHarnessUsage.mockReturnValue(usageQuery());
  mocks.useNodeAgents.mockReturnValue(agentsQuery());
});

function usageQuery(overrides: Record<string, unknown> = {}) {
  return {
    data: undefined,
    error: null,
    isPending: true,
    isFetching: true,
    refetch: vi.fn(),
    ...overrides,
  };
}
afterEach(() => {
  cleanup();
  useLocaleStore.setState({ locale: "en" });
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
    "claude-code",
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
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    const link = await screen.findByRole("link", {
      name: "Open Claude sign-in",
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
    await screen.findByText("· Signed in");
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
      screen.queryByRole("link", { name: "Open Claude sign-in" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Running agents may need a restart/),
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
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByText("ABCD-EFGH");
  expect(
    screen.getByRole("link", { name: "Open ChatGPT sign-in" }),
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
    await user.click(screen.getByRole("button", { name: "Sign in" }));
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
    screen.queryByRole("link", { name: "Open Claude sign-in" }),
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
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByText(
    "Sign-in expired. Start again to get a new link or code.",
  );
  expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
});

it("reports unavailable remote login without showing the API error body", async () => {
  mocks.getNodeHarnessAuth.mockRejectedValue(
    new ApiError("secret response", 404, {}),
  );
  mount();
  await screen.findByText(/Remote sign-in is unavailable/);
  expect(screen.queryByText(/secret response/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
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
    screen.queryByRole("link", { name: "Open Claude sign-in" }),
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
  expect(screen.getByText("· Signed in")).toBeInTheDocument();
  expect(mocks.getNodeHarnessAuth).toHaveBeenLastCalledWith(
    "self",
    "node-one",
    "claude-code",
    "login-one",
    expect.any(AbortSignal),
  );
  const calls = mocks.getNodeHarnessAuth.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000);
  });
  expect(mocks.getNodeHarnessAuth).toHaveBeenCalledTimes(calls);
});

it.each(["logged_in", "succeeded"])(
  "makes saved credentials clear in the %s state and keeps reauthentication available",
  async (state) => {
    mocks.getNodeHarnessAuth.mockResolvedValue({
      harness_auth: { harness: "claude", state, logged_in: true },
    });
    const user = userEvent.setup();
    mount();
    await screen.findByText("· Signed in");
    expect(screen.getByText("Credentials expired?")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Re-authenticate" }),
    ).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Re-authenticate" }));
    expect(mocks.loginNodeHarness).toHaveBeenCalledOnce();
  },
);

it("does not keep claiming credentials are present after the status check fails", async () => {
  mocks.getNodeHarnessAuth.mockResolvedValueOnce({
    harness_auth: { harness: "claude", state: "logged_in", logged_in: true },
  });
  const user = userEvent.setup();
  mount();
  await screen.findByText("· Signed in");
  mocks.getNodeHarnessAuth.mockRejectedValue(new Error("unavailable"));
  await user.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByText("Sign-in status could not be checked.");
  expect(screen.queryByText("· Signed in")).not.toBeInTheDocument();
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
  await user.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByText(/Remote sign-in is unavailable/);
  mocks.getNodeHarnessAuth.mockResolvedValue({
    harness_auth: { harness: "claude", state: "logged_out" },
  });
  await user.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByText("Not signed in on this device.");
  expect(mocks.getNodeHarnessAuth).toHaveBeenLastCalledWith(
    "self",
    "node-one",
    "claude-code",
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
    screen.queryByRole("link", { name: "Open Claude sign-in" }),
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
    screen.getByRole("link", { name: "Open Claude sign-in" }),
  ).toBeInTheDocument();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(
    screen.queryByRole("link", { name: "Open Claude sign-in" }),
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
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByText(/The device did not respond in time/);
  mocks.getNodeHarnessAuth.mockResolvedValue({ harness_auth: awaitingCode });
  await user.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByLabelText("Full authorization code");
  expect(mocks.loginNodeHarness).toHaveBeenCalledOnce();
  expect(mocks.getNodeHarnessAuth).toHaveBeenLastCalledWith(
    "self",
    "node-one",
    "claude-code",
    undefined,
    expect.any(AbortSignal),
  );
});

it.each(["claude-code", "codex"] as const)(
  "shows the native %s account email with optional name, organization and plan",
  async (harness) => {
    mocks.getNodeHarnessAuth.mockResolvedValue({
      harness_auth: {
        harness,
        state: "logged_in",
        logged_in: true,
        account: {
          email: "agent@example.test",
          display_name: "Agent Account",
          organization: "Example Workspace",
          plan: "Pro",
        },
      },
    });
    mount({ initialHarness: harness });
    await screen.findByText("agent@example.test");
    expect(screen.getByLabelText("Signed-in account")).toHaveTextContent(
      "agent@example.test",
    );
    expect(
      screen.getByText("Agent Account · Example Workspace"),
    ).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Re-authenticate" }),
    ).toBeEnabled();
  },
);

it("uses a reported display name when no account email is available", async () => {
  mocks.getNodeHarnessAuth.mockResolvedValue({
    harness_auth: {
      harness: "codex",
      state: "succeeded",
      logged_in: true,
      account: { display_name: "Reported Account" },
    },
  });
  mount({ initialHarness: "codex" });
  await screen.findByText("Reported Account");
  expect(
    screen.queryByText(/Account details are unavailable/),
  ).not.toBeInTheDocument();
});

it.each(["claude-code", "codex"] as const)(
  "handles older %s status responses without account metadata",
  async (harness) => {
    mocks.getNodeHarnessAuth.mockResolvedValue({
      harness_auth: { harness, state: "logged_in", logged_in: true },
    });
    mount({ initialHarness: harness });
    await screen.findByText("Account details are unavailable on this device.");
    expect(
      screen.queryByLabelText("Signed-in account"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("self")).not.toBeInTheDocument();
  },
);

it.each(["api_key", "access_token"])(
  "does not infer an account from the %s credential method",
  async (auth_method) => {
    mocks.getNodeHarnessAuth.mockResolvedValue({
      harness_auth: {
        harness: "codex",
        state: "logged_in",
        logged_in: true,
        auth_method,
      },
    });
    mount({ initialHarness: "codex" });
    await screen.findByText(
      "This sign-in method does not report account details.",
    );
    expect(
      screen.queryByLabelText("Signed-in account"),
    ).not.toBeInTheDocument();
  },
);

it.each([
  "logged_out",
  "starting",
  "awaiting_code",
  "awaiting_browser",
  "exchanging",
  "failed",
  "expired",
  "cancelled",
])("hides stale account metadata in the %s state", async (state) => {
  mocks.getNodeHarnessAuth.mockResolvedValue({
    harness_auth: {
      harness: "claude",
      state,
      account: { email: "stale@example.test" },
    },
  });
  mount();
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.queryByText("stale@example.test")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Signed-in account")).not.toBeInTheDocument();
  expect(
    screen.queryByText("Account details are unavailable on this device."),
  ).not.toBeInTheDocument();
});

it("hides a previously reported account when the status check fails", async () => {
  mocks.getNodeHarnessAuth.mockResolvedValueOnce({
    harness_auth: {
      harness: "claude",
      state: "logged_in",
      logged_in: true,
      account: { email: "stale@example.test" },
    },
  });
  const user = userEvent.setup();
  mount();
  await screen.findByText("stale@example.test");
  mocks.getNodeHarnessAuth.mockRejectedValue(new Error("offline"));
  await user.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByText("Sign-in status could not be checked.");
  expect(screen.queryByLabelText("Signed-in account")).not.toBeInTheDocument();
  expect(screen.queryByText("stale@example.test")).not.toBeInTheDocument();
});

it.each([
  ["Device", "node-two"],
  ["Agent type", "codex"],
])(
  "hides the previous account immediately when %s changes",
  async (label, value) => {
    mocks.getNodeHarnessAuth.mockResolvedValueOnce({
      harness_auth: {
        harness: "claude",
        state: "logged_in",
        logged_in: true,
        account: { email: "previous@example.test" },
      },
    });
    const user = userEvent.setup();
    mount();
    await screen.findByText("previous@example.test");
    mocks.getNodeHarnessAuth.mockReturnValue(new Promise(() => {}));
    await user.selectOptions(screen.getByLabelText(label), value);
    expect(screen.queryByText("previous@example.test")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Signed-in account"),
    ).not.toBeInTheDocument();
  },
);

it("hides the previous account while a new sign-in is being started", async () => {
  mocks.getNodeHarnessAuth.mockResolvedValueOnce({
    harness_auth: {
      harness: "claude",
      state: "logged_in",
      logged_in: true,
      account: { email: "previous@example.test" },
    },
  });
  const user = userEvent.setup();
  mount();
  await screen.findByText("previous@example.test");
  mocks.loginNodeHarness.mockReturnValue(new Promise(() => {}));
  await user.click(screen.getByRole("button", { name: "Re-authenticate" }));
  expect(screen.queryByText("previous@example.test")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Signed-in account")).not.toBeInTheDocument();
});

it.each(["logged_out", "awaiting_code", "failed"])(
  "does not read plan usage without detected credentials (%s)",
  async (state) => {
    mocks.getNodeHarnessAuth.mockResolvedValue({
      harness_auth: { ...awaitingCode, state },
    });
    mount();
    await screen.findByText(
      state === "logged_out"
        ? "Not signed in on this device."
        : state === "failed"
          ? /Sign-in failed/
          : /Approve access in your browser/,
    );
    expect(screen.queryByLabelText("Plan usage")).not.toBeInTheDocument();
    expect(mocks.useNodeHarnessUsage).not.toHaveBeenCalled();
  },
);

it.each(["claude-code", "codex"] as const)(
  "shows %s plan usage for the selected device once credentials are detected",
  async (harness) => {
    mocks.getNodeHarnessAuth.mockResolvedValue({
      harness_auth: { harness, state: "logged_in", logged_in: true },
    });
    mocks.useNodeHarnessUsage.mockReturnValue(
      usageQuery({
        isPending: false,
        isFetching: false,
        data: {
          harness_usage: {
            harness,
            state: "available",
            observed_at: new Date().toISOString(),
            items: [
              {
                id: "primary",
                label: "5-hour",
                kind: "percent",
                used_percent: 41,
              },
            ],
          },
        },
      }),
    );
    mount({ initialHarness: harness });
    const panel = await screen.findByLabelText("Plan usage");
    expect(panel).toHaveTextContent("5-hour");
    expect(panel).toHaveTextContent("41% used");
    expect(
      within(panel).getByRole("meter", { name: "5-hour" }),
    ).toHaveAttribute("aria-valuenow", "41");
    expect(mocks.useNodeHarnessUsage).toHaveBeenLastCalledWith(
      "self",
      "node-one",
      harness,
    );
  },
);

it("keeps the credential indicator and reauthentication when plan usage fails", async () => {
  mocks.getNodeHarnessAuth.mockResolvedValue({
    harness_auth: {
      harness: "claude",
      state: "logged_in",
      logged_in: true,
      account: { email: "agent@example.test" },
    },
  });
  mocks.useNodeHarnessUsage.mockReturnValue(
    usageQuery({
      isPending: false,
      isFetching: false,
      error: new ApiError("upstream body must not render", 502, {}),
    }),
  );
  mount();
  const status = await screen.findByText("· Signed in");
  expect(status.closest("p")).toHaveTextContent("Claude Code · Signed in");
  expect(
    screen.getByText("Plan usage could not be loaded."),
  ).toBeInTheDocument();
  expect(screen.queryByText(/upstream body/)).not.toBeInTheDocument();
  expect(screen.getByLabelText("Signed-in account")).toHaveTextContent(
    "agent@example.test",
  );
  expect(screen.getByRole("button", { name: "Re-authenticate" })).toBeEnabled();
});

it("hides plan usage while a new sign-in is being started", async () => {
  mocks.getNodeHarnessAuth.mockResolvedValueOnce({
    harness_auth: { harness: "claude", state: "logged_in", logged_in: true },
  });
  const user = userEvent.setup();
  mount();
  await screen.findByLabelText("Plan usage");
  mocks.loginNodeHarness.mockReturnValue(new Promise(() => {}));
  await user.click(screen.getByRole("button", { name: "Re-authenticate" }));
  expect(screen.queryByLabelText("Plan usage")).not.toBeInTheDocument();
});

it("lists only agent types registered in PAX for the selected device", async () => {
  mocks.useNodeAgents.mockReturnValue(
    agentsQuery([
      { agent_id: "a", node_id: "node-one", agent_type: "codex" },
      { agent_id: "b", node_id: "node-one", agent_type: "kimi" },
      { agent_id: "c", node_id: "node-one", agent_type: "codex" },
      { agent_id: "d", node_id: "node-one", agent_type: "claude" },
      { agent_id: "e", node_id: "node-two", agent_type: "opencode" },
    ]),
  );
  mount();
  await screen.findByText("Not signed in on this device.");
  const options = within(screen.getByLabelText("Agent type"))
    .getAllByRole("option")
    .map((option) => [option.getAttribute("value"), option.textContent]);
  expect(options).toEqual([
    ["claude-code", "Claude Code"],
    ["codex", "Codex"],
    ["kimi", "Kimi"],
  ]);
  expect(mocks.useNodeAgents).toHaveBeenLastCalledWith("self", "node-one");
});

it("falls back to the first registered agent type when the linked one is absent", async () => {
  mocks.useNodeAgents.mockReturnValue(
    agentsQuery([{ agent_id: "a", node_id: "node-one", agent_type: "codex" }]),
  );
  mount({ initialHarness: "claude-code" });
  await screen.findByText("Not signed in on this device.");
  expect(screen.getByLabelText("Agent type")).toHaveValue("codex");
  expect(mocks.getNodeHarnessAuth).toHaveBeenCalledWith(
    "self",
    "node-one",
    "codex",
    undefined,
    expect.any(AbortSignal),
  );
});

it("explains when the device has no registered agents", () => {
  mocks.useNodeAgents.mockReturnValue(agentsQuery([]));
  mount();
  expect(
    screen.getByText(/No agents are registered on this device/),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Agent type")).toBeDisabled();
  expect(mocks.getNodeHarnessAuth).not.toHaveBeenCalled();
});

it("hides sign-in controls for agent types without native sign-in and still shows usage", async () => {
  mocks.useNodeAgents.mockReturnValue(
    agentsQuery([{ agent_id: "a", node_id: "node-one", agent_type: "kimi" }]),
  );
  mocks.getNodeHarnessAuth.mockResolvedValue({
    harness_auth: { harness: "kimi", state: "unsupported" },
  });
  mocks.useNodeHarnessUsage.mockReturnValue(
    usageQuery({
      isPending: false,
      isFetching: false,
      data: {
        harness_usage: {
          harness: "kimi",
          harness_label: "Kimi Code",
          state: "available",
          items: [
            { id: "credits", label: "Credits", kind: "status", value: "ok" },
          ],
        },
      },
    }),
  );
  mount();
  expect(
    await screen.findByText("Sign-in is not available for Kimi yet."),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText("Sign-in method")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /sign-in|sign in/i }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Plan usage")).toHaveTextContent("Credits");
});

it.each([
  ["claude-code", "claude.ai", "subscription"],
  ["claude-code", "api_key", "console"],
  ["claude-code", undefined, "subscription"],
  ["codex", "chatgpt", "device"],
  ["codex", "api_key", "api-key"],
  ["codex", "access_token", "access-token"],
  ["codex", "unknown", "device"],
] as const)(
  "re-authenticates %s with the method that produced %s",
  (harness, authMethod, method) => {
    expect(defaultSignInMethod(harness, authMethod)).toBe(method);
  },
);

it("asks for a new key before re-authenticating a Codex API-key sign-in", async () => {
  mocks.getNodeHarnessAuth.mockResolvedValue({
    harness_auth: {
      harness: "codex",
      state: "logged_in",
      logged_in: true,
      auth_method: "api_key",
    },
  });
  const user = userEvent.setup();
  mount({ initialHarness: "codex" });
  await screen.findByText("· Signed in");
  expect(screen.queryByLabelText("Sign-in method")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Re-authenticate" }));
  expect(mocks.loginNodeHarness).not.toHaveBeenCalled();
  expect(screen.getByText("OpenAI API key")).toBeInTheDocument();
  expect(screen.getByLabelText("API key")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByLabelText("API key")).not.toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "Use a different method" }),
  );
  expect(screen.getByLabelText("Sign-in method")).toHaveValue("api-key");
  expect(
    screen.getByRole("option", { name: "ChatGPT account" }),
  ).toBeInTheDocument();
});

it("given account credentials, when switching language, then preserves the draft and sends unchanged protocol values", async () => {
  mount({ initialHarness: "codex" });
  await screen.findByText("Not signed in on this device.");
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Sign-in method" }),
    "api-key",
  );
  await userEvent.type(
    screen.getByLabelText("API key"),
    "fictional-credential",
  );
  act(() => useLocaleStore.setState({ locale: "zh-CN" }));
  expect(screen.getByText("此设备尚未登录。")).toBeVisible();
  expect(screen.getByLabelText("API 密钥")).toHaveValue("fictional-credential");
  await userEvent.click(screen.getByRole("button", { name: "登录" }));
  expect(mocks.loginNodeHarness).toHaveBeenCalledWith(
    "self",
    "node-one",
    "codex",
    expect.objectContaining({
      operation: "start",
      method: "api-key",
      code: "fictional-credential",
    }),
    expect.any(AbortSignal),
  );
});

it("given server account details, when showing Chinese credential labels, then preserves the plan name", async () => {
  mocks.getNodeHarnessAuth.mockResolvedValue({
    harness_auth: {
      harness: "claude-code",
      state: "logged_in",
      logged_in: true,
      auth_method: "api_key",
      account: { email: "person@example.test", plan: "Settings" },
    },
  });
  useLocaleStore.setState({ locale: "zh-CN" });
  mount();
  await screen.findByText("person@example.test");
  expect(screen.getByText("Settings")).toBeVisible();
  expect(screen.getByText("API 密钥")).toBeVisible();
});
