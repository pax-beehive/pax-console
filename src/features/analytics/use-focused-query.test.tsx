// @vitest-environment jsdom
import React, { StrictMode } from "react";
import { act, cleanup, render } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useFocusedQuery } from "./use-focused-query";

let focused = false;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("React", React);
  vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  focused = false;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("Given TanStack triggers, no mount, focus-manager, reconnect or invalidation can fetch an unfocused dashboard", async () => {
  const client = new QueryClient();
  const load = vi.fn().mockResolvedValue({ value: 1 });
  function View() {
    const q = useFocusedQuery<{ value: number }>("test", "u1", load);
    return <span>{q.data?.value}</span>;
  }
  const view = render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <View />
      </QueryClientProvider>
    </StrictMode>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(load).not.toHaveBeenCalled();
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
    await client.invalidateQueries();
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(load).not.toHaveBeenCalled();
  await act(async () => {
    focused = true;
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => {
    focused = false;
    window.dispatchEvent(new Event("blur"));
    await client.invalidateQueries();
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(load).toHaveBeenCalledTimes(1);
  view.unmount();
  client.clear();
  focusManager.setFocused(undefined);
});
it("Given an in-flight request, blur aborts it and unmount prevents later requests", async () => {
  focused = true;
  const client = new QueryClient();
  let signal: AbortSignal | undefined;
  const load = vi.fn((value: AbortSignal) => {
    signal = value;
    return new Promise<unknown>((_resolve, reject) =>
      value.addEventListener("abort", () => reject(new Error("aborted"))),
    );
  });
  function View() {
    useFocusedQuery("test", "u1", load);
    return null;
  }
  const view = render(
    <QueryClientProvider client={client}>
      <View />
    </QueryClientProvider>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => {
    focused = false;
    window.dispatchEvent(new Event("blur"));
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(signal?.aborted).toBe(true);
  view.unmount();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(load).toHaveBeenCalledTimes(1);
  client.clear();
});
