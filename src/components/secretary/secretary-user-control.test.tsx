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
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SecretaryGuidanceEditor,
  SecretarySessionControl,
} from "./secretary-user-control";
import type { SecretaryOperation } from "@/features/api/secretary-control";

const fetchMock = vi.fn<typeof fetch>();
const clients: QueryClient[] = [];
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ code: status, data, message: "conflict" }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const guidance = {
  scope: "user" as const,
  revision: 1,
  instruction: "Keep useful conclusions",
};
const operation: SecretaryOperation = {
  operation_id: "operation",
  source_id: "42",
  kind: "human_summary",
  status: "draft",
  revision: 1,
  targets: [1, 2].map((n) => ({
    message_id: `m${n}`,
    content_hash: `hash${n}`,
    canonicalization_version: "visible-v1",
    change_revision: n,
    role: "user",
    preview: `Deployment ${n}`,
  })),
  instructions: { user: guidance },
  baseline_refs: [],
  result_refs: [],
};
function setup(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("Secretary user summary control", () => {
  it("requires saving or discarding session guidance before preparing a new operation", async () => {
    let saved = { ...guidance, scope: "session", source_id: "42" };
    fetchMock.mockImplementation(async (_url, init) => {
      if (init?.method === "PUT") {
        saved = {
          ...saved,
          revision: 2,
          instruction: JSON.parse(String(init.body)).instruction,
        };
        return response(saved);
      }
      return response(saved);
    });
    setup(<SecretarySessionControl userId="self" sourceId="42" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Guide or write summary" }),
    );
    const input = await screen.findByLabelText("Requirements for this session");
    fireEvent.change(input, { target: { value: "Retain meaningful changes" } });
    expect(
      screen.getByRole("button", { name: "Guide Secretary" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Write summary yourself" }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        "Save or discard session requirements before preparing.",
      ),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith("/prepare")),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Save requirements" }));
    await screen.findByText("Requirements saved for future tasks.");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Guide Secretary" }),
      ).toBeEnabled(),
    );
    fireEvent.change(input, { target: { value: "Another draft" } });
    expect(
      screen.getByRole("button", { name: "Guide Secretary" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
    expect(input).toHaveValue("Retain meaningful changes");
    expect(
      screen.getByRole("button", { name: "Guide Secretary" }),
    ).toBeEnabled();
  });
  it("hides cached session requirements and the draft after source access becomes unavailable", async () => {
    let denied = false;
    fetchMock.mockImplementation(async (_url, init) => {
      if (init?.method === "PUT") {
        denied = true;
        return response({}, 409);
      }
      return denied
        ? response({}, 404)
        : response({ ...guidance, scope: "session", source_id: "42" });
    });
    setup(<SecretaryGuidanceEditor userId="self" sourceId="42" />);
    const input = await screen.findByLabelText("Requirements for this session");
    expect(input).toHaveValue(guidance.instruction);
    fireEvent.change(input, { target: { value: "Private working copy" } });
    fireEvent.click(screen.getByRole("button", { name: "Save requirements" }));
    await screen.findByText("These requirements are no longer available.");
    expect(
      screen.queryByLabelText("Requirements for this session"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByDisplayValue("Private working copy"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByDisplayValue(guidance.instruction),
    ).not.toBeInTheDocument();
  });
  it("reopens a persisted current operation by ID without preparing or dispatching new work", async () => {
    fetchMock.mockImplementation(async () =>
      response({
        ...operation,
        kind: "guided_summary",
        status: "queued",
        instructions: {
          user: guidance,
          run: "Only retain meaningful differences",
        },
      }),
    );
    setup(
      <SecretarySessionControl
        userId="self"
        sourceId="42"
        operationId="operation"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "View current operation" }),
    );
    await screen.findByText(
      "Secretary is processing this fixed range. Your instructions remain attached across batches and retries.",
    );
    expect(
      screen.getByText("Only retain meaningful differences"),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.every(([, init]) => init?.method === "GET"),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.every(([url]) =>
        String(url).endsWith("/secretary/operations/operation"),
      ),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(
      screen.getByRole("button", { name: "Guide or write summary" }),
    ).toBeInTheDocument();
  });
  it("preserves an unsaved requirements draft across conflict refetch and clears only on explicit reload", async () => {
    let saved = guidance;
    fetchMock.mockImplementation(async (_url, init) => {
      if (init?.method === "PUT") {
        saved = { ...guidance, revision: 2, instruction: "Changed elsewhere" };
        return response({}, 409);
      }
      return response(saved);
    });
    setup(<SecretaryGuidanceEditor userId="self" />);
    const input = await screen.findByLabelText("Requirements for all sessions");
    fireEvent.change(input, { target: { value: "My unsaved draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Save requirements" }));
    await screen.findByText(
      "Saved requirements changed. Your draft is preserved. Reload before saving again.",
    );
    expect(input).toHaveValue("My unsaved draft");
    expect(
      screen.getByRole("button", { name: "Save requirements" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Reload saved requirements" }),
    );
    expect(input).toHaveValue("Changed elsewhere");
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT"),
    ).toHaveLength(1);
  });
  it("lets a user complete selected messages with separate representative sources without calling a model", async () => {
    let persisted = operation;
    fetchMock.mockImplementation(async (url) => {
      if (String(url).endsWith("/prepare")) return response(operation);
      if (String(url).endsWith("/submit")) {
        persisted = { ...operation, status: "completed", revision: 2 };
        return response(persisted);
      }
      return response(
        String(url).includes("guidance")
          ? { ...guidance, scope: "session", source_id: "42" }
          : persisted,
      );
    });
    setup(<SecretarySessionControl userId="self" sourceId="42" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Guide or write summary" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Write summary yourself" }),
    );
    await screen.findByLabelText("Summary title");
    fireEvent.click(screen.getByLabelText("Process message 1"));
    fireEvent.click(screen.getByLabelText("Cite message 2"));
    fireEvent.change(screen.getByLabelText("Summary title"), {
      target: { value: "Manual releases" },
    });
    fireEvent.change(screen.getByLabelText("Summary content"), {
      target: { value: "Many manual releases before the release platform." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save and complete selected range" }),
    );
    await screen.findByText(
      "Summary saved. Processing progress has been updated.",
    );
    const calls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/submit"),
    );
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0][1]?.body))).toMatchObject({
      expected_revision: 1,
      message_ids: ["m2"],
      coverage_message_ids: ["m2"],
      title: "Manual releases",
    });
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/run")),
    ).toBe(false);
  });
  it("retains the request ID after a lost response, and uses a new ID when instructions change", async () => {
    const guided = { ...operation, kind: "guided_summary" as const };
    fetchMock.mockImplementation(async (url) => {
      if (String(url).endsWith("/submit")) return response({}, 503);
      return response(String(url).includes("guidance") ? guidance : guided);
    });
    setup(<SecretarySessionControl userId="self" sourceId="42" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Guide or write summary" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Guide Secretary" }),
    );
    const input = await screen.findByLabelText(
      "Requirements for this operation only",
    );
    fireEvent.change(input, {
      target: { value: "Condense repeated activity" },
    });
    const button = screen.getByRole("button", {
      name: "Summarize selected messages",
    });
    fireEvent.click(button);
    await screen.findByText(
      "The result is unconfirmed. Your draft and request ID are kept. Check status or retry the same request.",
    );
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/submit")),
      ).toHaveLength(2),
    );
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.change(input, {
      target: { value: "Keep only meaningful changes" },
    });
    fireEvent.click(button);
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/submit")),
      ).toHaveLength(3),
    );
    const requests = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("/submit"))
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(requests[0].request_id).toBe(requests[1].request_id);
    expect(requests[2].request_id).not.toBe(requests[0].request_id);
    expect(requests[2].run_instruction).toBe("Keep only meaningful changes");
  });
  it("requires explicit replacement confirmation without clearing a rejected manual draft", async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith("/submit")
        ? response({}, 409)
        : response(String(url).includes("guidance") ? guidance : operation),
    );
    setup(<SecretarySessionControl userId="self" sourceId="42" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Guide or write summary" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Write summary yourself" }),
    );
    fireEvent.change(await screen.findByLabelText("Summary title"), {
      target: { value: "Draft" },
    });
    fireEvent.change(screen.getByLabelText("Summary content"), {
      target: { value: "Preserve me" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save and complete selected range" }),
    );
    await screen.findByText(/The source, summary, or task changed/);
    expect(screen.getByLabelText("Summary content")).toHaveValue("Preserve me");
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Replace this session/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save and complete selected range" }),
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/submit")),
      ).toHaveLength(2),
    );
    const submissions = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("/submit"))
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(submissions[0].confirm_replace).toBeUndefined();
    expect(submissions[1].confirm_replace).toBe(true);
    expect(submissions[1].request_id).not.toBe(submissions[0].request_id);
  });
  it("edits the frozen summary baseline without sending processing or source selections", async () => {
    const editing: SecretaryOperation = {
      ...operation,
      kind: "human_edit",
      targets: [],
      summary: {
        summary_id: "summary",
        revision: 7,
        title: "Existing title",
        body: "Existing body",
        coverage: [],
        owner_user_id: "owner",
        subject_type: "fragment",
        subject_id: "subject",
        created_at: "2026-11-12T12:00:00Z",
      },
    };
    let persisted = editing;
    fetchMock.mockImplementation(async (url) => {
      if (String(url).endsWith("/submit"))
        persisted = { ...editing, status: "completed", revision: 2 };
      return response(String(url).includes("guidance") ? guidance : persisted);
    });
    setup(
      <SecretarySessionControl
        userId="self"
        sourceId="42"
        summaryId="summary"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Edit or guide summary" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit this summary" }),
    );
    expect(await screen.findByLabelText("Summary content")).toHaveValue(
      "Existing body",
    );
    fireEvent.change(screen.getByLabelText("Summary content"), {
      target: { value: "User correction" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save summary version" }),
    );
    await screen.findByText(
      "Summary version saved. Message progress is unchanged.",
    );
    const call = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/submit"),
    );
    const payload = JSON.parse(String(call?.[1]?.body));
    expect(payload).toMatchObject({
      summary_id: "summary",
      expected_summary_revision: 7,
      body: "User correction",
    });
    expect(payload).not.toHaveProperty("message_ids");
    expect(payload).not.toHaveProperty("coverage_message_ids");
  });
  it("prepares an explicit deduplicated message range without silently taking the first messages", async () => {
    fetchMock.mockImplementation(async (url) =>
      response(String(url).includes("guidance") ? guidance : operation),
    );
    setup(<SecretarySessionControl userId="self" sourceId="42" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Guide or write summary" }),
    );
    fireEvent.change(await screen.findByLabelText("Message range"), {
      target: { value: "selected" },
    });
    const button = screen.getByRole("button", {
      name: "Write summary yourself",
    });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Message IDs (advanced)"), {
      target: { value: "m2, m1\nm2" },
    });
    fireEvent.click(button);
    await screen.findByLabelText("Summary title");
    const call = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/prepare"),
    );
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      source_id: "42",
      kind: "human_summary",
      scope: "selected",
      message_ids: ["m2", "m1"],
    });
  });
  it("hides frozen source previews if operation access is revoked while the dialog is open", async () => {
    let denied = false;
    fetchMock.mockImplementation(async (url) => {
      if (denied && String(url).endsWith("/operation"))
        return response({}, 403);
      return response(String(url).includes("guidance") ? guidance : operation);
    });
    setup(<SecretarySessionControl userId="self" sourceId="42" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Guide or write summary" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Write summary yourself" }),
    );
    await screen.findByText(/Deployment 1/);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Check status" }),
      ).toBeEnabled(),
    );
    denied = true;
    fireEvent.click(screen.getByRole("button", { name: "Check status" }));
    await screen.findByText(
      "This operation is no longer available to you. Sign in again or reopen this session to check current access.",
    );
    expect(screen.queryByText(/Deployment 1/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Save and complete selected range",
      }),
    ).not.toBeInTheDocument();
  });
  it.each([
    [
      "outcome_unknown",
      "The previous execution may still be running. Check its task's existing result before choosing to replace it.",
    ],
    [
      "source_changed",
      "Messages changed after this range was prepared. Prepare a fresh range before summarizing again.",
    ],
    [
      "private raw execution error",
      "The operation could not finish. Review this session's task for its current failure reason.",
    ],
  ])(
    "explains an attention outcome safely (%s) without offering another submit",
    async (code, expected) => {
      const blocked = { ...operation, status: "needs_attention", error: code };
      fetchMock.mockImplementation(async (url) =>
        response(String(url).includes("guidance") ? guidance : blocked),
      );
      setup(<SecretarySessionControl userId="self" sourceId="42" />);
      fireEvent.click(
        screen.getByRole("button", { name: "Guide or write summary" }),
      );
      fireEvent.click(
        await screen.findByRole("button", { name: "Write summary yourself" }),
      );
      expect(await screen.findByText(expected)).toBeInTheDocument();
      expect(
        screen.queryByRole("button", {
          name: "Save and complete selected range",
        }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("private raw execution error"),
      ).not.toBeInTheDocument();
    },
  );
});
