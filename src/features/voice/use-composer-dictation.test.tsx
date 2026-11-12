/* @vitest-environment jsdom */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeVoiceSocket } from "./test-fakes";
import { useComposerDictation } from "./use-composer-dictation";

vi.mock("./microphone", () => ({
  startMicrophone: async () => ({ sampleRate: 16_000, stop: () => {} }),
}));

const sockets: FakeVoiceSocket[] = [];
const ready = { type: "ready", provider: "fake", sample_rate: 16_000 };

beforeEach(() => {
  sockets.length = 0;
  vi.stubGlobal(
    "WebSocket",
    class extends FakeVoiceSocket {
      constructor(url: string) {
        super(url);
        sockets.push(this);
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function dictateThenSend(
  props: { draftKey: string; blocked: boolean },
  send: () => void,
) {
  const hook = renderHook(
    ({ draftKey, blocked }) =>
      useComposerDictation({ draftKey, blocked, send }),
    { initialProps: props },
  );
  act(() => hook.result.current.start());
  await waitFor(() => expect(sockets).toHaveLength(1));
  act(() => {
    sockets[0].open();
    sockets[0].receive(ready);
  });
  act(() => hook.result.current.sendWhenDone());
  expect(hook.result.current.sendPending).toBe(true);
  expect(sockets[0].json().at(-1)).toEqual({ type: "stop" });
  return hook;
}

describe("useComposerDictation", () => {
  it("sends once the final transcript arrives", async () => {
    const send = vi.fn();
    const { result } = await dictateThenSend(
      { draftKey: "d1", blocked: false },
      send,
    );
    act(() => result.current.sendWhenDone());
    act(() => sockets[0].receive({ type: "done", final: "hello" }));
    expect(send).toHaveBeenCalledOnce();
    expect(result.current.sendPending).toBe(false);
  });

  it("does not send when dictation fails", async () => {
    const send = vi.fn();
    const { result } = await dictateThenSend(
      { draftKey: "d1", blocked: false },
      send,
    );
    act(() => sockets[0].receive({ type: "error", code: "provider_failed" }));
    expect(send).not.toHaveBeenCalled();
    expect(result.current.error).toBe(
      "Speech recognition stopped unexpectedly",
    );
  });

  it("does not send another draft after switching drafts", async () => {
    const send = vi.fn();
    const { rerender, result } = await dictateThenSend(
      { draftKey: "d1", blocked: false },
      send,
    );
    rerender({ draftKey: "d2", blocked: false });
    expect(sockets[0].json().at(-1)).toEqual({ type: "cancel" });
    await waitFor(() => expect(result.current.sendPending).toBe(false));
    expect(send).not.toHaveBeenCalled();
  });

  it("cancels without sending when the composer becomes encrypted", async () => {
    const send = vi.fn();
    const { rerender, result } = await dictateThenSend(
      { draftKey: "d1", blocked: false },
      send,
    );
    rerender({ draftKey: "d1", blocked: true });
    expect(sockets[0].json().at(-1)).toEqual({ type: "cancel" });
    await waitFor(() => expect(result.current.sendPending).toBe(false));
    expect(send).not.toHaveBeenCalled();
  });
});
