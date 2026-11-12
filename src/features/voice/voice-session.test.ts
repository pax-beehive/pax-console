import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeVoiceTransport } from "./test-fakes";
import { VoiceInputError } from "./voice-errors";
import {
  VoiceSession,
  type VoiceSessionOptions,
  type VoiceSessionResult,
} from "./voice-session";

function setup(overrides: Partial<VoiceSessionOptions> = {}) {
  const transport = fakeVoiceTransport();
  const phases: string[] = [];
  const transcripts: [string, string][] = [];
  const results: VoiceSessionResult[] = [];
  const session = new VoiceSession({
    url: "wss://voice.example/api/v1/user/self/voice/stream",
    hints: { keywords: ["paxd"], context: ["User: hi"] },
    onPhase: (phase) => phases.push(phase),
    onTranscript: (final, partial) => transcripts.push([final, partial]),
    onEnd: (result) => results.push(result),
    ...transport.options,
    ...overrides,
  });
  return { session, phases, transcripts, results, ...transport };
}

const ready = { type: "ready", provider: "fake", sample_rate: 16_000 };

describe("VoiceSession", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("streams buffered and live audio, then finishes with the transcript", async () => {
    const t = setup();
    await t.session.start();
    const socket = t.sockets[0];
    expect(socket.url).toBe(
      "wss://voice.example/api/v1/user/self/voice/stream",
    );
    expect(socket.binaryType).toBe("arraybuffer");
    socket.open();
    expect(socket.json()).toEqual([
      { type: "start", keywords: ["paxd"], context: ["User: hi"] },
    ]);

    // Audio from before ready is kept and sent once the server is ready.
    t.feed(new Array(1_600).fill(0.5));
    expect(socket.audio()).toEqual([]);
    socket.receive(ready);
    expect(t.phases).toEqual(["connecting", "recording"]);
    expect(socket.audio()).toHaveLength(1);
    expect(socket.audio()[0]).toHaveLength(1_600);

    t.feed(new Array(800).fill(0));
    expect(socket.audio()).toHaveLength(1);
    socket.receive({ type: "transcript", final: "", partial: "hel" });
    expect(t.transcripts).toEqual([["", "hel"]]);

    t.session.stop();
    expect(t.stops).toHaveLength(1);
    expect(t.phases.at(-1)).toBe("finishing");
    // The partial frame is flushed before stop.
    expect(socket.audio()[1]).toHaveLength(800);
    expect(socket.json().at(-1)).toEqual({ type: "stop" });

    socket.receive({ type: "done", final: "hello" });
    expect(t.results).toEqual([{ text: "hello" }]);
    expect(socket.readyState).toBe(3);
  });

  it("sends stop right after ready when the user stops early", async () => {
    const t = setup();
    await t.session.start();
    const socket = t.sockets[0];
    socket.open();
    t.feed(new Array(400).fill(0.1));
    t.session.stop();
    expect(socket.json()).toHaveLength(1);
    socket.receive(ready);
    expect(socket.audio()).toHaveLength(1);
    expect(socket.json().at(-1)).toEqual({ type: "stop" });
    expect(t.phases).toEqual(["connecting", "finishing"]);
  });

  it("reports server errors with a readable message", async () => {
    const t = setup();
    await t.session.start();
    t.sockets[0].open();
    t.sockets[0].receive({ type: "error", code: "provider_unavailable" });
    expect(t.results).toHaveLength(1);
    expect(t.results[0].error?.code).toBe("provider_unavailable");
    expect(t.results[0].error?.message).toBe(
      "Speech recognition is unavailable right now",
    );
  });

  it("distinguishes a refused connection from a dropped one", async () => {
    const refused = setup();
    await refused.session.start();
    refused.sockets[0].drop();
    expect(refused.results[0].error?.code).toBe("connection_failed");

    const dropped = setup();
    await dropped.session.start();
    dropped.sockets[0].open();
    dropped.sockets[0].drop();
    expect(dropped.results[0].error?.code).toBe("connection_lost");
  });

  it("never connects when the microphone is unavailable", async () => {
    const t = setup({
      startMicrophone: async () => {
        throw new VoiceInputError("microphone_denied", "blocked");
      },
    });
    await t.session.start();
    expect(t.sockets).toHaveLength(0);
    expect(t.results[0].error?.code).toBe("microphone_denied");
  });

  it("cancels without waiting for a result", async () => {
    const t = setup();
    await t.session.start();
    const socket = t.sockets[0];
    socket.open();
    socket.receive(ready);
    t.session.cancel();
    expect(socket.json().at(-1)).toEqual({ type: "cancel" });
    expect(socket.readyState).toBe(3);
    expect(t.results).toEqual([{}]);
    expect(t.stops).toHaveLength(1);
  });

  it("gives up when the final transcript never arrives", async () => {
    vi.useFakeTimers();
    const t = setup();
    await t.session.start();
    t.sockets[0].open();
    t.sockets[0].receive(ready);
    t.session.stop();
    vi.advanceTimersByTime(25_000);
    expect(t.results[0].error?.code).toBe("timeout");
  });
});
