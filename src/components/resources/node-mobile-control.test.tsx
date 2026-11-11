/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  mobileControl,
  type MobileSession,
  type MobileState,
} from "@/features/mobile-control/api";
import { NodeMobileViewer } from "./node-mobile-control";

vi.mock("@/features/mobile-control/api", () => ({
  mobileControl: vi.fn(),
  readMobileRecording: vi.fn(),
}));
const control = vi.mocked(mobileControl);
const PHONE = "m-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER = "m-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
let state: MobileState;
let frame = 0;
let rejectInput = false;

beforeEach(() => {
  frame = 0;
  rejectInput = false;
  control.mockReset();
  const phone = (id: string): MobileSession => ({
    id,
    deviceId: id,
    template: "clean",
    state: "running",
    takeover: false,
    recoveryRequired: false,
    createdAt: "2026-11-10",
  });
  state = {
    available: true,
    mode: "screenshots-and-recordings",
    remoteWebRTC: false,
    templates: [{ name: "clean", available: true }],
    sessions: [phone(PHONE), phone(OTHER)],
  };
  control.mockImplementation(async (_u, _n, operation, raw) => {
    const value = raw as { sessionId: string };
    if (operation === "state") return structuredClone(state);
    if (operation === "recording_list") return [];
    if (operation === "screenshot")
      return {
        mime: "image/png",
        data: "YWJj",
        width: 100,
        height: 200,
        frameId: `cccccccc-cccc-cccc-cccc-${String(++frame).padStart(12, "0")}`,
      };
    const session = state.sessions.find(
      (session) => session.id === value.sessionId,
    )!;
    if (operation === "takeover") {
      session.takeover = true;
      return structuredClone(session);
    }
    if (operation === "release") {
      session.takeover = false;
      return structuredClone(session);
    }
    if (operation === "key" && rejectInput)
      throw Error("Input result uncertain. Refresh before retrying.");
    return {};
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup(
  props: {
    onPrepare?: () => Promise<boolean>;
    prepareDisabled?: boolean;
  } = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <NodeMobileViewer userId="u" nodeId="n" {...props} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { ...view, client, user: userEvent.setup() };
}

it("leaves phone preparation to the agent and offers a setup guide outside a session", async () => {
  setup();
  await screen.findByRole("combobox", { name: "Android phone" });
  for (const name of [
    "Create phone",
    "Start phone",
    "Stop phone",
    "Destroy phone",
  ])
    expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
  expect(
    screen.queryByRole("combobox", { name: "Android template" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Ask agent to prepare phone" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Android setup guide" }),
  ).toHaveAttribute(
    "href",
    "https://github.com/CCGV2/agent-mobile-runtime/blob/main/docs/agent-preparation.md",
  );
  expect(
    control.mock.calls.some((call) =>
      ["create", "start", "stop", "destroy"].includes(call[2]),
    ),
  ).toBe(false);
});

it("sends preparation to the agent only on request even when the runtime is unavailable", async () => {
  state.available = false;
  state.sessions = [];
  const onPrepare = vi.fn().mockResolvedValue(true);
  const { user } = setup({ onPrepare });
  await screen.findByText(/Android runtime is not ready/);
  expect(onPrepare).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Ask agent to prepare phone" }),
  );
  expect(onPrepare).toHaveBeenCalledOnce();
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Preparation request sent to the agent. Follow progress in chat.",
  );
  expect(
    control.mock.calls.some((call) =>
      ["create", "start", "stop", "destroy"].includes(call[2]),
    ),
  ).toBe(false);
});

it("keeps the agent preparation action available when runtime status cannot be loaded", async () => {
  control.mockRejectedValue(new Error("Runtime status is unavailable"));
  const onPrepare = vi.fn().mockResolvedValue(true);
  const { user } = setup({ onPrepare });
  await screen.findByText(/Runtime status is unavailable/);
  await user.click(
    screen.getByRole("button", { name: "Ask agent to prepare phone" }),
  );
  expect(onPrepare).toHaveBeenCalledOnce();
});

it("fences repeated preparation clicks and other phone actions until the prompt is accepted", async () => {
  let finish!: (value: boolean) => void;
  const pending = new Promise<boolean>((resolve) => {
    finish = resolve;
  });
  const onPrepare = vi.fn(() => pending);
  const { user } = setup({ onPrepare });
  await user.selectOptions(
    await screen.findByRole("combobox", { name: "Android phone" }),
    PHONE,
  );
  await screen.findByRole("img", { name: "Android phone screenshot" });
  await user.dblClick(
    screen.getByRole("button", { name: "Ask agent to prepare phone" }),
  );
  expect(onPrepare).toHaveBeenCalledOnce();
  expect(
    screen.getByRole("button", { name: "Sending preparation request…" }),
  ).toBeDisabled();
  expect(screen.getByRole("button", { name: "Take control" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Start recording" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("combobox", { name: "Android phone" }),
  ).toBeDisabled();
  await act(async () => {
    finish(true);
    await pending;
  });
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Preparation request sent",
  );
  expect(
    control.mock.calls.some((call) =>
      ["create", "start", "stop", "destroy"].includes(call[2]),
    ),
  ).toBe(false);
});

it.each([false, "reject"])(
  "shows an unaccepted preparation request (%s) without automatically retrying",
  async (result) => {
    const onPrepare = vi.fn();
    if (result === "reject")
      onPrepare.mockRejectedValueOnce(new Error("Session offline"));
    else onPrepare.mockResolvedValueOnce(false);
    onPrepare.mockResolvedValueOnce(true);
    const { user } = setup({ onPrepare });
    await screen.findByRole("combobox", { name: "Android phone" });
    await user.click(
      screen.getByRole("button", { name: "Ask agent to prepare phone" }),
    );
    await screen.findByText(/Check the session, then try again/);
    expect(onPrepare).toHaveBeenCalledOnce();
    expect(
      screen.queryByText(/Preparation request sent to the agent/),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Ask agent to prepare phone" }),
    );
    expect(onPrepare).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Preparation request sent",
    );
  },
);

it("does not send preparation while the current session is unavailable for prompts", async () => {
  const onPrepare = vi.fn();
  const { user } = setup({ onPrepare, prepareDisabled: true });
  await screen.findByRole("combobox", { name: "Android phone" });
  const prepare = screen.getByRole("button", {
    name: "Ask agent to prepare phone",
  });
  expect(prepare).toBeDisabled();
  await user.click(prepare);
  expect(onPrepare).not.toHaveBeenCalled();
});

it("shows a stopped phone as agent preparation work without dispatching a lifecycle request", async () => {
  state.sessions[0].state = "stopped";
  const { user } = setup();
  await user.selectOptions(
    await screen.findByRole("combobox", { name: "Android phone" }),
    PHONE,
  );
  expect(
    await screen.findByText(/The agent needs to start this phone/),
  ).toBeVisible();
  expect(
    control.mock.calls.some((call) =>
      ["create", "start", "stop", "destroy"].includes(call[2]),
    ),
  ).toBe(false);
});

it("requires explicit phone selection and takeover before any input", async () => {
  const { user, client } = setup();
  await screen.findByRole("combobox", { name: "Android phone" });
  expect(
    screen.queryByRole("img", { name: "Android phone screenshot" }),
  ).not.toBeInTheDocument();
  expect(control.mock.calls.some((call) => call[2] === "screenshot")).toBe(
    false,
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Android phone" }),
    PHONE,
  );
  await screen.findByRole("img", { name: "Android phone screenshot" });
  expect(
    JSON.stringify(
      client
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data),
    ),
  ).not.toContain("YWJj");
  expect(screen.getByRole("button", { name: "Home" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Take control" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Home" })).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "Home" }));
  await waitFor(() =>
    expect(control.mock.calls.some((call) => call[2] === "key")).toBe(true),
  );
  const sent = control.mock.calls.find((call) => call[2] === "key")![3];
  expect(sent).toMatchObject({
    sessionId: PHONE,
    key: "HOME",
    frameId: expect.stringMatching(/^cccccccc-/),
  });
});

it("does not regain control from a takeover response that arrives after blur", async () => {
  const handler = control.getMockImplementation()!;
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  control.mockImplementation(async (...args) => {
    if (args[2] === "takeover") await gate;
    return handler(...args);
  });
  const { user } = setup();
  await user.selectOptions(
    await screen.findByRole("combobox", { name: "Android phone" }),
    PHONE,
  );
  await screen.findByRole("img", { name: "Android phone screenshot" });
  await user.click(screen.getByRole("button", { name: "Take control" }));
  act(() => window.dispatchEvent(new Event("blur")));
  await act(async () => {
    finish();
    await gate;
  });
  act(() => window.dispatchEvent(new Event("focus")));
  await screen.findByRole("img", { name: "Android phone screenshot" });
  expect(screen.getByRole("button", { name: "Home" })).toBeDisabled();
  expect(
    control.mock.calls.filter((call) => call[2] === "takeover"),
  ).toHaveLength(1);
});

it.each(["blur", "unmount"])(
  "cancels queued input on %s before it is dispatched",
  async (action) => {
    const handler = control.getMockImplementation()!;
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const dispatched = vi.fn();
    let inputSignal: AbortSignal | undefined;
    control.mockImplementation(async (...args) => {
      if (args[2] === "key") {
        inputSignal = args[4];
        await gate;
        inputSignal?.throwIfAborted();
        dispatched();
      }
      return handler(...args);
    });
    const { user, unmount } = setup();
    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Android phone" }),
      PHONE,
    );
    await screen.findByRole("img", { name: "Android phone screenshot" });
    await user.click(screen.getByRole("button", { name: "Take control" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Home" })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: "Home" }));
    await waitFor(() => expect(inputSignal).toBeDefined());
    const screenshots = control.mock.calls.filter(
      (call) => call[2] === "screenshot",
    ).length;
    if (action === "unmount") unmount();
    else act(() => window.dispatchEvent(new Event("blur")));
    expect(inputSignal!.aborted).toBe(true);
    await act(async () => {
      finish();
      await gate;
    });
    expect(dispatched).not.toHaveBeenCalled();
    expect(
      control.mock.calls.filter((call) => call[2] === "screenshot"),
    ).toHaveLength(screenshots);
    expect(control.mock.calls.filter((call) => call[2] === "key")).toHaveLength(
      1,
    );
  },
);

it("does not retry an uncertain input or silently control a newly selected phone", async () => {
  const { user } = setup();
  rejectInput = true;
  await user.selectOptions(
    await screen.findByRole("combobox", { name: "Android phone" }),
    PHONE,
  );
  await screen.findByRole("img", { name: "Android phone screenshot" });
  await user.click(screen.getByRole("button", { name: "Take control" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Home" })).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "Home" }));
  await screen.findByText(/Input result uncertain/);
  expect(control.mock.calls.filter((call) => call[2] === "key")).toHaveLength(
    1,
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Android phone" }),
    OTHER,
  );
  await screen.findByRole("img", { name: "Android phone screenshot" });
  expect(screen.getByRole("button", { name: "Home" })).toBeDisabled();
  expect(
    control.mock.calls.filter((call) => call[2] === "takeover"),
  ).toHaveLength(1);
});

it("pauses preview and drops local input ownership on blur without auto retaking on focus", async () => {
  const { user } = setup();
  await user.selectOptions(
    await screen.findByRole("combobox", { name: "Android phone" }),
    PHONE,
  );
  await screen.findByRole("img", { name: "Android phone screenshot" });
  await user.click(screen.getByRole("button", { name: "Take control" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Home" })).toBeEnabled(),
  );
  act(() => window.dispatchEvent(new Event("blur")));
  expect(screen.getByText(/Preview paused/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Home" })).toBeDisabled();
  act(() => window.dispatchEvent(new Event("focus")));
  await screen.findByRole("img", { name: "Android phone screenshot" });
  expect(screen.getByRole("button", { name: "Home" })).toBeDisabled();
  expect(
    control.mock.calls.filter((call) => call[2] === "takeover"),
  ).toHaveLength(1);
  expect(
    control.mock.calls.filter((call) => call[2] === "release"),
  ).toHaveLength(0);
});

it("does not follow another phone when the selected phone disappears", async () => {
  const { user, client } = setup();
  await user.selectOptions(
    await screen.findByRole("combobox", { name: "Android phone" }),
    PHONE,
  );
  await screen.findByRole("img", { name: "Android phone screenshot" });
  state.sessions = state.sessions.filter((session) => session.id !== PHONE);
  await act(async () => {
    await client.invalidateQueries({
      queryKey: ["user", "u", "node", "n", "mobile-control"],
    });
  });
  expect(await screen.findByText(/no longer available/)).toBeVisible();
  expect(
    screen.queryByRole("img", { name: "Android phone screenshot" }),
  ).not.toBeInTheDocument();
  expect(
    control.mock.calls.some(
      (call) =>
        call[2] === "screenshot" &&
        (call[3] as { sessionId: string }).sessionId === OTHER,
    ),
  ).toBe(false);
});
