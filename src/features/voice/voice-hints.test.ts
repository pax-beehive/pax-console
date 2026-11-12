import { describe, expect, it } from "vitest";
import type { SessionEvent } from "@/features/runtime/session-events";
import { buildVoiceHints } from "./voice-hints";

function message(
  type: "user_message" | "agent_message",
  content: string,
  id = content,
): SessionEvent {
  return { type, id, sessionId: "s1", content, createdAt: "2026-11-12" };
}

describe("buildVoiceHints", () => {
  it("collects project vocabulary and recent messages", () => {
    const hints = buildVoiceHints([
      message("user_message", "Wire the `Mic` button in session-composer.tsx"),
      {
        type: "file_change",
        id: "f1",
        sessionId: "s1",
        path: "src/features/voice/use-voice-dictation.ts",
        createdAt: "2026-11-12",
      },
      message(
        "agent_message",
        "Updated useVoiceDictation and voice_handlers via SessionComposer.",
      ),
    ]);
    expect(hints.keywords).toEqual(
      expect.arrayContaining([
        "useVoiceDictation",
        "voice_handlers",
        "SessionComposer",
        "use-voice-dictation.ts",
        "src/features/voice/use-voice-dictation.ts",
        "Mic",
        "session-composer.tsx",
      ]),
    );
    expect(hints.keywords?.[0]).toBe("useVoiceDictation");
    expect(hints.context).toEqual([
      "User: Wire the `Mic` button in session-composer.tsx",
      "Agent: Updated useVoiceDictation and voice_handlers via SessionComposer.",
    ]);
  });

  it("keeps only the newest messages and trims long ones", () => {
    const events = Array.from({ length: 12 }, (_, index) =>
      message("user_message", `message ${index} ${"x".repeat(400)}`),
    );
    const context = buildVoiceHints(events).context ?? [];
    expect(context).toHaveLength(8);
    expect(context[0]).toMatch(/^User: message 4 /);
    expect(context.at(-1)).toMatch(/^User: message 11 /);
    expect(context.every((entry) => entry.length <= 306)).toBe(true);
  });

  it("returns no hints for an empty session", () => {
    expect(buildVoiceHints([])).toEqual({
      keywords: undefined,
      context: undefined,
    });
  });
});
