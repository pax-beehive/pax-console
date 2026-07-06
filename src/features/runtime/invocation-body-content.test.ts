import { describe, expect, it } from "vitest";
import { invocationBodyContent } from "./invocation-body-content";

describe("invocationBodyContent", () => {
  it("shows business display text instead of original text", () => {
    expect(
      invocationBodyContent(
        {
          type: "invocation",
          id: "msg_invocation",
          sessionId: "sess_1",
          content:
            "今天（2026年7月6日）纽约目前下雨，约 72°F / 22°C。接下来上午到中午以多云和雷阵雨为主，气温大约 72-74°F / 22-23°C；出门建议带伞，并留意雷雨。",
          originalContent: "今天天气如何？",
          replacesMessageIds: [],
          createdAt: "2026-07-06T12:00:00.000Z",
        },
        {},
      ),
    ).toBe(
      "今天（2026年7月6日）纽约目前下雨，约 72°F / 22°C。接下来上午到中午以多云和雷阵雨为主，气温大约 72-74°F / 22-23°C；出门建议带伞，并留意雷雨。",
    );
  });

  it("falls back to original text for generic invocation display text", () => {
    expect(
      invocationBodyContent(
        {
          type: "invocation",
          id: "msg_invocation",
          sessionId: "sess_1",
          content: "Received a Pax conversation reply from agent_123.",
          originalContent: "今天天气如何？",
          replacesMessageIds: [],
          createdAt: "2026-07-06T12:00:00.000Z",
        },
        {},
      ),
    ).toBe("今天天气如何？");
  });
});
