/* @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useConsoleStore } from "@/stores/console-store";
import { fakeVoiceTransport } from "./test-fakes";
import { useVoiceDictation } from "./use-voice-dictation";

const draftKey = "voice-test-draft";
const draft = () => useConsoleStore.getState().composerDrafts[draftKey];
const ready = { type: "ready", provider: "fake", sample_rate: 16_000 };

describe("useVoiceDictation", () => {
  afterEach(() => {
    useConsoleStore.getState().setComposerDraft(draftKey, "");
  });

  it("rewrites spoken text in place at the caret", async () => {
    useConsoleStore.getState().setComposerDraft(draftKey, "Please  now");
    const textarea = document.createElement("textarea");
    textarea.value = "Please  now";
    textarea.setSelectionRange(7, 7);
    const transport = fakeVoiceTransport();
    const { result } = renderHook(() =>
      useVoiceDictation({
        draftKey,
        getHints: () => ({ keywords: ["paxd"] }),
        sessionOptions: transport.options,
      }),
    );
    await act(async () => result.current.start(textarea));
    const socket = transport.sockets[0];
    expect(socket.url).toMatch(/\/api\/v1\/user\/self\/voice\/stream$/);
    act(() => socket.open());
    expect(socket.json()[0]).toEqual({ type: "start", keywords: ["paxd"] });
    act(() => socket.receive(ready));
    expect(result.current.status).toBe("recording");
    expect(result.current.startedAt).toBeTypeOf("number");

    act(() =>
      socket.receive({ type: "transcript", final: "", partial: "run" }),
    );
    expect(draft()).toBe("Please run now");
    act(() =>
      socket.receive({
        type: "transcript",
        final: "Run the",
        partial: "tests",
      }),
    );
    expect(draft()).toBe("Please Run the tests now");

    act(() => result.current.stop());
    expect(result.current.status).toBe("finishing");
    act(() => socket.receive({ type: "done", final: "Run the tests." }));
    expect(draft()).toBe("Please Run the tests. now");
    expect(result.current.status).toBe("idle");
  });

  it("keeps the spoken text and shows an error when the stream fails", async () => {
    useConsoleStore.getState().setComposerDraft(draftKey, "");
    const transport = fakeVoiceTransport();
    const { result } = renderHook(() =>
      useVoiceDictation({ draftKey, sessionOptions: transport.options }),
    );
    await act(async () => result.current.start());
    const socket = transport.sockets[0];
    act(() => {
      socket.open();
      socket.receive(ready);
      socket.receive({ type: "transcript", final: "partial", partial: "" });
      socket.receive({ type: "error", code: "provider_failed" });
    });
    expect(draft()).toBe("partial");
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBe(
      "Speech recognition stopped unexpectedly",
    );
    act(() => result.current.dismissError());
    expect(result.current.error).toBeUndefined();
  });

  it("abandons dictation when the composer switches drafts", async () => {
    const transport = fakeVoiceTransport();
    const { result, rerender } = renderHook(
      ({ key }) =>
        useVoiceDictation({ draftKey: key, sessionOptions: transport.options }),
      { initialProps: { key: draftKey } },
    );
    await act(async () => result.current.start());
    const socket = transport.sockets[0];
    act(() => {
      socket.open();
      socket.receive(ready);
    });
    rerender({ key: "another-draft" });
    expect(socket.json().at(-1)).toEqual({ type: "cancel" });
    expect(transport.stops).toHaveLength(1);
  });
});
