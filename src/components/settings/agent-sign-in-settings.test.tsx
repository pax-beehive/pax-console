/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@/features/api/errors";
import { queryKeys } from "@/features/api/query-keys";
import type { HostedStarterStatus } from "@/features/api/types";
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
  useAgents: vi.fn(),
  readHostedSandbox: vi.fn(),
  readHostedStarter: vi.fn(),
  activateHostedAgent: vi.fn(),
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
  // No agents across devices by default, so nothing else is checked for
  // sign-in beyond the selected card.
  mocks.useAgents.mockReturnValue({ data: { agents: [] } });
  mocks.readHostedStarter.mockResolvedValue({ enabled: false });
  mocks.readHostedSandbox.mockResolvedValue(null);
  mocks.activateHostedAgent.mockReset();
});

/** Every device answers; only the listed device/agent pairs are signed out. */
function signedOutOn(...pairs: string[]) {
  mocks.useAgents.mockReturnValue({ data: { agents: registeredAgents } });
  mocks.getNodeHarnessAuth.mockImplementation(
    async (_userId: string, nodeId: string, harness: string) => ({
      harness_auth: pairs.includes(`${nodeId}/${harness}`)
        ? { harness, state: "logged_out", logged_in: false }
        : { harness, state: "logged_in", logged_in: true },
    }),
  );
}
const needsSignIn = () =>
  screen.queryByRole("group", { name: "Agents that need sign-in" });

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
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AgentSignInSettings
          userId="self"
          initialNodeId="node-one"
          {...props}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
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

const enrolledPi = {
  enabled: true,
  enrolled_node: true,
  starter: { node_id: "node-one", state: "sleeping" },
};
const sandboxPi = {
  agent_id: "sandbox-pi",
  node_id: "node-one",
  agent_type: "pi",
  name: "Sandbox Pi",
  online: true,
};

it("opens Pax quota for the selected sandbox Pi only after an explicit click", async () => {
  const user = userEvent.setup();
  mocks.useNodeAgents.mockReturnValue(
    agentsQuery([
      { ...sandboxPi, agent_id: "other-pi", node_id: "node-two" },
      sandboxPi,
    ]),
  );
  mocks.readHostedStarter.mockResolvedValue(enrolledPi);
  mocks.activateHostedAgent.mockImplementation(async () => {
    const ready = {
      ...enrolledPi,
      starter: {
        ...enrolledPi.starter,
        state: "ready",
        agent_id: sandboxPi.agent_id,
      },
    };
    mocks.readHostedStarter.mockResolvedValue(ready);
    return ready;
  });

  mount({ initialHarness: "pi" });
  const useQuota = await screen.findByRole("button", {
    name: "Use Pax free quota",
  });
  expect(screen.getByText(/\/login/)).toBeInTheDocument();
  expect(mocks.getNodeHarnessAuth).not.toHaveBeenCalled();
  expect(mocks.activateHostedAgent).not.toHaveBeenCalled();

  await user.click(useQuota);

  expect(mocks.activateHostedAgent).toHaveBeenCalledExactlyOnceWith(
    "node-one",
    sandboxPi.agent_id,
  );
  expect(
    await screen.findByText("Pax free quota is ready."),
  ).toBeInTheDocument();

  await user.selectOptions(screen.getByLabelText("Device"), "node-two");
  expect(screen.getByText(/\/login/)).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Use Pax free quota" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText("Pax free quota is ready."),
  ).not.toBeInTheDocument();
  expect(mocks.activateHostedAgent).toHaveBeenCalledTimes(1);
});

it("does not offer Pax quota on a device without confirmed sandbox enrollment", async () => {
  mocks.useNodeAgents.mockReturnValue(agentsQuery([sandboxPi]));
  mocks.readHostedStarter.mockResolvedValue({
    ...enrolledPi,
    enrolled_node: false,
  });

  mount({ initialHarness: "pi" });

  expect(await screen.findByText(/\/login/)).toBeInTheDocument();
  expect(mocks.readHostedStarter).toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: "Use Pax free quota" }),
  ).not.toBeInTheDocument();
  expect(mocks.activateHostedAgent).not.toHaveBeenCalled();
});

it("does not offer Pax quota when the selected sandbox is offline", async () => {
  const offlinePi = { ...sandboxPi, node_id: "offline" };
  mocks.useNodeAgents.mockReturnValue(agentsQuery([offlinePi]));
  mocks.readHostedStarter.mockResolvedValue({
    ...enrolledPi,
    starter: { ...enrolledPi.starter, node_id: "offline" },
  });

  mount({ initialNodeId: "offline", initialHarness: "pi" });

  expect(screen.getByText(/This device is offline/)).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Use Pax free quota" }),
  ).not.toBeInTheDocument();
  expect(mocks.activateHostedAgent).not.toHaveBeenCalled();
});

it("requires choosing the Pi when the sandbox has more than one without an active lease", async () => {
  const user = userEvent.setup();
  const secondPi = { ...sandboxPi, agent_id: "second-pi", name: "Second Pi" };
  mocks.useNodeAgents.mockReturnValue(agentsQuery([sandboxPi, secondPi]));
  mocks.readHostedStarter.mockResolvedValue(enrolledPi);
  mocks.activateHostedAgent.mockResolvedValue(enrolledPi);

  mount({ initialHarness: "pi" });

  const agent = await screen.findByLabelText("Pi agent");
  expect(agent).toHaveValue("");
  expect(
    screen.queryByRole("button", { name: "Use Pax free quota" }),
  ).not.toBeInTheDocument();
  await user.selectOptions(agent, secondPi.agent_id);
  expect(mocks.activateHostedAgent).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Use Pax free quota" }));

  expect(mocks.activateHostedAgent).toHaveBeenCalledExactlyOnceWith(
    "node-one",
    secondPi.agent_id,
  );
});

const awsModelAccess = {
  enabled: true,
  pool_available: true,
  user_budget_available: true,
  sandbox_model_access: {
    node_id: "node-one",
    harnesses: ["pi", "codex", "claude-code", "dscode"],
    state: "available",
  },
} satisfies HostedStarterStatus;

it.each(["codex", "claude-code", "dscode"])(
  "offers Pax quota to a Manager-approved AWS sandbox %s while preserving native sign-in",
  async (harness) => {
    const user = userEvent.setup();
    const agentId = `sandbox-${harness}`;
    mocks.useNodeAgents.mockReturnValue(
      agentsQuery([
        { agent_id: agentId, node_id: "node-one", agent_type: harness },
      ]),
    );
    mocks.readHostedStarter.mockResolvedValue(awsModelAccess);
    mocks.getNodeHarnessAuth.mockResolvedValue({
      harness_auth: { harness, state: "logged_out", logged_in: false },
    });
    const queued = {
      ...awsModelAccess,
      sandbox_model_access: {
        ...awsModelAccess.sandbox_model_access,
        agent_id: agentId,
        state: "queued",
      },
    };
    mocks.activateHostedAgent.mockImplementation(async () => {
      mocks.readHostedStarter.mockResolvedValue(queued);
      return queued;
    });
    const { queryClient } = mount({ initialHarness: harness });
    const useQuota = await screen.findByRole("button", {
      name: "Use Pax free quota",
    });
    if (harness === "codex" || harness === "claude-code") {
      expect(await screen.findByLabelText("Sign-in method")).toBeEnabled();
    }
    expect(mocks.activateHostedAgent).not.toHaveBeenCalled();
    await user.dblClick(useQuota);
    expect(
      await screen.findByText("Setting up free model access…"),
    ).toBeVisible();
    expect(mocks.activateHostedAgent).toHaveBeenCalledExactlyOnceWith(
      "node-one",
      agentId,
    );
    expect(mocks.loginNodeHarness).not.toHaveBeenCalled();

    mocks.readHostedStarter.mockResolvedValue({
      ...queued,
      sandbox_model_access: { ...queued.sandbox_model_access, state: "ready" },
    });
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.hostedStarter("self"),
      });
    });
    expect(await screen.findByText("Pax free quota is ready.")).toBeVisible();
  },
);

it("binds the AWS lease to the exact selected agent instead of another agent using the same harness", async () => {
  const user = userEvent.setup();
  const agent = { ...sandboxPi, agent_type: "codex", name: "First Codex" };
  const second = { ...agent, agent_id: "second", name: "Second Codex" };
  mocks.useNodeAgents.mockReturnValue(agentsQuery([agent, second]));
  mocks.readHostedStarter.mockResolvedValue({
    ...awsModelAccess,
    sandbox_model_access: {
      ...awsModelAccess.sandbox_model_access,
      state: "ready",
      agent_id: second.agent_id,
    },
  });

  mount({ initialHarness: "codex" });

  const picker = await screen.findByLabelText("Codex agent");
  expect(picker).toHaveValue(second.agent_id);
  expect(screen.getByText("Pax free quota is ready.")).toBeVisible();
  await user.selectOptions(picker, agent.agent_id);
  expect(
    screen.getByText(
      "Free model access is assigned to another agent in this sandbox.",
    ),
  ).toBeVisible();
  expect(
    screen.queryByText("Pax free quota is ready."),
  ).not.toBeInTheDocument();
  expect(mocks.activateHostedAgent).not.toHaveBeenCalled();
});

it("allows two AWS agents on the same sandbox to activate quota independently", async () => {
  const user = userEvent.setup();
  const first = { ...sandboxPi, agent_type: "codex", name: "First Codex" };
  const second = { ...first, agent_id: "second", name: "Second Codex" };
  mocks.useNodeAgents.mockReturnValue(agentsQuery([first, second]));
  const result: HostedStarterStatus = {
    ...awsModelAccess,
    sandbox_model_access: {
      ...awsModelAccess.sandbox_model_access,
      agents: [],
    },
  };
  mocks.readHostedStarter.mockImplementation(async () =>
    structuredClone(result),
  );
  mocks.activateHostedAgent.mockImplementation(async (_nodeId, agentId) => {
    result.sandbox_model_access!.agents!.push({
      agent_id: agentId,
      state: agentId === first.agent_id ? "ready" : "queued",
    });
    return structuredClone(result);
  });

  const { queryClient } = mount({ initialHarness: "codex" });
  const picker = await screen.findByLabelText("Codex agent");
  await user.selectOptions(picker, first.agent_id);
  await user.click(
    await screen.findByRole("button", { name: "Use Pax free quota" }),
  );
  expect(await screen.findByText("Pax free quota is ready.")).toBeVisible();

  await user.selectOptions(picker, second.agent_id);
  await user.click(
    await screen.findByRole("button", { name: "Use Pax free quota" }),
  );
  expect(
    await screen.findByText("Setting up free model access…"),
  ).toBeVisible();
  expect(mocks.activateHostedAgent.mock.calls).toEqual([
    ["node-one", first.agent_id],
    ["node-one", second.agent_id],
  ]);

  await user.selectOptions(picker, first.agent_id);
  expect(screen.getByText("Pax free quota is ready.")).toBeVisible();
  await user.selectOptions(picker, second.agent_id);
  expect(screen.getByText("Setting up free model access…")).toBeVisible();

  result.sandbox_model_access!.agents![1].state = "ready";
  await act(async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.hostedStarter("self"),
    });
  });
  expect(await screen.findByText("Pax free quota is ready.")).toBeVisible();
});

it.each([
  { node_id: "node-two" },
  { harnesses: ["pi"] },
  { harnesses: ["codex", 42] },
  { state: "unknown" },
  { state: "ready" },
  { agents: [{ agent_id: "node-one-codex", state: "unknown" }] },
  {
    agents: [
      { agent_id: "node-one-codex", state: "ready" },
      { agent_id: "node-one-codex", state: "failed" },
    ],
  },
])("does not offer AWS quota for unverified eligibility %o", async (fields) => {
  const status = {
    ...awsModelAccess,
    sandbox_model_access: { ...awsModelAccess.sandbox_model_access, ...fields },
  };
  mocks.readHostedStarter.mockResolvedValue(status);
  const { queryClient } = mount({ initialHarness: "codex" });
  await waitFor(() => {
    expect(queryClient.getQueryData(queryKeys.hostedStarter("self"))).toEqual(
      status,
    );
  });
  expect(
    screen.queryByRole("button", { name: "Use Pax free quota" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText("Pax free quota is ready."),
  ).not.toBeInTheDocument();
  expect(mocks.activateHostedAgent).not.toHaveBeenCalled();
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

it("names the device of each agent that needs sign-in and opens the one that is picked", async () => {
  signedOutOn("node-two/codex");
  const user = userEvent.setup();
  mount({ initialNodeId: undefined });
  expect(screen.getByLabelText("Device")).toHaveValue("");
  const pick = await screen.findByRole("button", { name: "Codex on Server" });
  expect(within(needsSignIn()!).getAllByRole("button")).toHaveLength(1);
  // Offline devices cannot answer, so they are not asked.
  expect(mocks.getNodeHarnessAuth).not.toHaveBeenCalledWith(
    "self",
    "offline",
    expect.anything(),
    undefined,
    expect.any(AbortSignal),
  );

  await user.click(pick);
  expect(screen.getByLabelText("Device")).toHaveValue("node-two");
  expect(screen.getByLabelText("Agent type")).toHaveValue("codex");
  expect(
    await screen.findByText("Not signed in on this device."),
  ).toBeVisible();
  // The card now reports it, so it is not listed a second time.
  expect(needsSignIn()).not.toBeInTheDocument();
  expect(mocks.loginNodeHarness).not.toHaveBeenCalled();
});

it("leaves out the agent being shown and one that signs in on this page", async () => {
  signedOutOn("node-one/claude-code", "node-two/codex");
  const user = userEvent.setup();
  mount({ initialNodeId: "node-one", initialHarness: "claude-code" });
  await screen.findByText("Not signed in on this device.");
  const other = await screen.findByRole("button", { name: "Codex on Server" });
  expect(
    screen.queryByRole("button", { name: "Claude Code on Laptop" }),
  ).not.toBeInTheDocument();

  // Showing another agent brings the first one into the list.
  await user.selectOptions(screen.getByLabelText("Agent type"), "codex");
  expect(
    await screen.findByRole("button", { name: "Claude Code on Laptop" }),
  ).toBeVisible();
  await user.selectOptions(screen.getByLabelText("Agent type"), "claude-code");
  await screen.findByText("Not signed in on this device.");

  // It signs in here; the list was read when the page opened.
  signedOutOn("node-two/codex");
  await user.click(screen.getByRole("button", { name: "Refresh" }));
  await within(
    screen.getByRole("region", { name: "Claude Code sign-in" }),
  ).findByText(/Signed in/);
  await user.click(other);
  expect(screen.getByLabelText("Device")).toHaveValue("node-two");
  await screen.findByText("Not signed in on this device.");
  expect(needsSignIn()).not.toBeInTheDocument();
});

it("shows the only device right away, but never in place of a linked or cleared one", async () => {
  mocks.useNodes.mockReturnValue({
    data: { nodes: [nodes[0], nodes[3]] },
    refetch: vi.fn(),
  });
  const user = userEvent.setup();
  const first = mount({ initialNodeId: undefined });
  expect(screen.getByLabelText("Device")).toHaveValue("node-one");
  expect(
    await screen.findByText("Not signed in on this device."),
  ).toBeVisible();
  await user.selectOptions(screen.getByLabelText("Device"), "");
  expect(screen.getByLabelText("Device")).toHaveValue("");
  expect(
    screen.getByText("Choose a device to check its sign-in status."),
  ).toBeVisible();
  first.unmount();

  mount({ initialNodeId: "missing" });
  expect(
    screen.getByText(/This device is unavailable to your account/),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Device")).toHaveValue("missing");
});

it("given Chinese, when agents need sign-in, then names the device first", async () => {
  signedOutOn("node-two/codex");
  useLocaleStore.setState({ locale: "zh-CN" });
  mount({ initialNodeId: undefined });
  expect(
    await screen.findByRole("button", { name: "Server 上的 Codex" }),
  ).toBeVisible();
  expect(screen.getByText("需要登录：")).toBeVisible();
});
