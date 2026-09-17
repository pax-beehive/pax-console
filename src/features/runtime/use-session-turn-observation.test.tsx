/* @vitest-environment jsdom */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSessionTurnObservation } from "./use-session-turn-observation";
import { useSessionObserver } from "./session-observer";

describe("session turn discovery", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("subscribes to the next turn even when runtime stays running", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(
          'data: {"type":"turn_done","session_id":"session","turn_id":"first"}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender, unmount } = renderHook(
      ({ turnId }) => {
        const observation = useSessionTurnObservation("session", turnId, true);
        useSessionObserver({
          userId: "self",
          agentId: "agent",
          sessionId: "session",
          enabled: !observation.suppressed,
          turnId: observation.turnId,
        });
        return observation;
      },
      { initialProps: { turnId: "first" } },
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toContain("turn_id=first");
    act(() => result.current.suppress());
    expect(result.current.suppressed).toBe(true);
    rerender({ turnId: "second" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(result.current.suppressed).toBe(false);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("turn_id=second");
    unmount();
  });

  it("clears suppression after idle for runtimes without a turn ID", async () => {
    const { result, rerender } = renderHook(
      ({ running }) => useSessionTurnObservation("session", undefined, running),
      { initialProps: { running: true } },
    );
    act(() => result.current.suppress());
    rerender({ running: false });
    await waitFor(() => expect(result.current.suppressed).toBe(false));
    rerender({ running: true });
    expect(result.current.suppressed).toBe(false);
  });
});
