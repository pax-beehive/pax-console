import { describe, expect, it } from "vitest";
import { parseVoiceServerMessage } from "./voice-protocol";

describe("parseVoiceServerMessage", () => {
  it("parses every server message type", () => {
    expect(
      parseVoiceServerMessage(
        '{"type":"ready","provider":"qwen","sample_rate":16000,"encoding":"pcm_s16le"}',
      ),
    ).toEqual({
      type: "ready",
      provider: "qwen",
      sampleRate: 16_000,
      encoding: "pcm_s16le",
    });
    expect(
      parseVoiceServerMessage(
        '{"type":"transcript","final":"a","partial":"b"}',
      ),
    ).toEqual({ type: "transcript", final: "a", partial: "b" });
    expect(parseVoiceServerMessage('{"type":"done","final":"ab"}')).toEqual({
      type: "done",
      final: "ab",
    });
    expect(
      parseVoiceServerMessage(
        '{"type":"error","code":"timeout","message":"late"}',
      ),
    ).toEqual({ type: "error", code: "timeout", message: "late" });
  });

  it("ignores malformed or unknown messages", () => {
    expect(parseVoiceServerMessage("not json")).toBeUndefined();
    expect(parseVoiceServerMessage("[]")).toBeUndefined();
    expect(parseVoiceServerMessage('{"type":"ready"}')).toBeUndefined();
    expect(parseVoiceServerMessage('{"type":"pong"}')).toBeUndefined();
    expect(parseVoiceServerMessage(new ArrayBuffer(2))).toBeUndefined();
  });
});
