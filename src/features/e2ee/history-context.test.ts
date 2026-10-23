import { normalizeHistoryMessages } from "../runtime/normalize-history-message";
import { describe, expect, it, vi } from "vitest";
import type { HistoryMessage } from "../api/types";
import {
  EncryptedPromptCache,
  withEncryptedPromptContext,
} from "./history-context";
import {
  flattenEncryptedHistoryPages,
  type EncryptedHistoryPage,
} from "./transport";

function message(id: number, turn: string, role = "assistant"): HistoryMessage {
  return {
    id,
    message_id: `message_${id}`,
    turn_id: turn,
    role,
    revision: 1,
    parts: [
      {
        part_index: 0,
        part_type: "text",
        text: role === "user" ? `prompt ${turn}` : "response",
      },
    ],
  };
}
function page(messages: HistoryMessage[], before = 0): EncryptedHistoryPage {
  return {
    messages,
    pagination: { has_more: before > 0, next_before_id: before },
  };
}

describe("encrypted history prompt context", () => {
  it("recovers the prompt beyond 500 rows and keeps the original tool-page cursor", async () => {
    const base = page(
      Array.from({ length: 500 }, (_, i) => message(i + 101, "long-turn")),
      101,
    );
    const load = vi
      .fn()
      .mockResolvedValueOnce(page([message(50, "long-turn")], 50))
      .mockResolvedValueOnce(
        page([
          message(1, "previous", "user"),
          message(2, "long-turn", "user"),
          message(3, "long-turn"),
        ]),
      );
    const result = await withEncryptedPromptContext(base, load);
    expect(result.messages).toHaveLength(501);
    expect(
      normalizeHistoryMessages(result.messages).filter(
        (event) => event.type === "user_message",
      ),
    ).toMatchObject([{ content: "prompt long-turn", turnId: "long-turn" }]);
    expect(result.messages[0]).toMatchObject({ id: 2, role: "user" });
    expect(
      result.messages.some(
        (item) => item.id === 1 || item.id === 3 || item.id === 50,
      ),
    ).toBe(false);
    expect(result.pagination).toEqual(base.pagination);
    expect(load.mock.calls).toEqual([[101], [50]]);
  });

  it("matches every page turn by ID instead of borrowing a nearby unrelated prompt", async () => {
    const base = page([message(20, "a"), message(30, "b")], 20);
    const load = vi
      .fn()
      .mockResolvedValueOnce(
        page([message(11, "unrelated", "user"), message(12, "b", "user")], 11),
      )
      .mockResolvedValueOnce(page([message(2, "a", "user")]));
    const result = await withEncryptedPromptContext(base, load);
    expect(result.messages.map((item) => item.id)).toEqual([2, 12, 20, 30]);
  });

  it("reuses authenticated prompts during polling and does not duplicate them across pages", async () => {
    const cache = new EncryptedPromptCache();
    const older = page([message(1, "turn", "user"), message(2, "turn")]);
    const load = vi.fn().mockResolvedValue(older);
    const first = await withEncryptedPromptContext(
      page([message(3, "turn")], 3),
      load,
      cache,
    );
    const refreshed = await withEncryptedPromptContext(
      page([message(4, "turn")], 4),
      load,
      cache,
    );
    expect(load).toHaveBeenCalledTimes(1);
    expect(refreshed.messages.map((item) => item.id)).toEqual([1, 4]);
    expect(
      flattenEncryptedHistoryPages([first, older]).map((item) => item.id),
    ).toEqual([1, 2, 3]);
  });

  it("does not scan when prompts are already on the page or turns are unbound", async () => {
    const load = vi.fn();
    const base = page(
      [
        message(1, "turn", "user"),
        message(2, "turn"),
        message(3, "turn_unbound"),
        message(4, ""),
      ],
      1,
    );
    expect((await withEncryptedPromptContext(base, load)).messages).toEqual(
      base.messages,
    );
    expect(load).not.toHaveBeenCalled();
  });

  it("terminates at the beginning without fabricating a missing user message", async () => {
    const base = page([message(10, "orphan")], 10);
    const load = vi.fn().mockResolvedValue(page([message(1, "other", "user")]));
    expect((await withEncryptedPromptContext(base, load)).messages).toEqual(
      base.messages,
    );
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("rejects a stalled cursor and propagates a failed context read", async () => {
    const base = page([message(10, "turn")], 10);
    await expect(
      withEncryptedPromptContext(
        base,
        vi.fn().mockResolvedValue(page([message(5, "turn")], 10)),
      ),
    ).rejects.toThrow("did not advance");
    await expect(
      withEncryptedPromptContext(
        base,
        vi.fn().mockRejectedValue(new Error("authentication failed")),
      ),
    ).rejects.toThrow("authentication failed");
  });

  it("does not cache a header before its prompt parts arrive", async () => {
    const cache = new EncryptedPromptCache();
    const base = page([message(10, "turn")], 10);
    const load = vi
      .fn()
      .mockResolvedValueOnce(
        page([{ ...message(1, "turn", "user"), parts: [] }]),
      )
      .mockResolvedValueOnce(page([message(1, "turn", "user")]));
    expect(
      (await withEncryptedPromptContext(base, load, cache)).messages,
    ).toHaveLength(1);
    const complete = await withEncryptedPromptContext(base, load, cache);
    expect(complete.messages[0]).toMatchObject({
      role: "user",
      parts: [{ text: "prompt turn" }],
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("retains attachment-only prompts without requiring text", async () => {
    const prompt = {
      ...message(1, "turn", "user"),
      parts: [],
      raw_json: {
        params: {
          prompt: [
            {
              type: "resource_link",
              name: "report.txt",
              uri: "file:///private/report.txt",
            },
          ],
        },
      },
    };
    const result = await withEncryptedPromptContext(
      page([message(5, "turn")], 5),
      vi.fn().mockResolvedValue(page([prompt])),
    );
    expect(result.messages[0]).toEqual(prompt);
  });

  it("keeps only a bounded prompt cache and prefers newer revisions", () => {
    const cache = new EncryptedPromptCache();
    for (let i = 0; i < 65; i++)
      cache.remember(message(i, `turn_${i}`, "user"));
    expect(cache.get("turn_0")).toBeUndefined();
    cache.remember({ ...message(64, "turn_64", "user"), revision: 2 });
    cache.remember(message(64, "turn_64", "user"));
    expect(cache.get("turn_64")?.revision).toBe(2);
  });
});
