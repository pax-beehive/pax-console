import { describe, expect, it } from "vitest";
import {
  buildE2EECancelFrame,
  buildE2EEPromptFrame,
  buildE2EESessionNewFrame,
  extractE2EEFrameText,
  parseE2EERPCResponse,
} from "./session-lab";

describe("E2EE session lab", () => {
  it("builds a cancel notification for the encrypted session", () => {
    expect(buildE2EECancelFrame("manager_1")).toEqual({
      jsonrpc: "2.0",
      method: "session/cancel",
      params: { sessionId: "manager_1" },
    });
  });

  it("builds a prompt for the encrypted native ACP session", () => {
    expect(buildE2EEPromptFrame("request_1", "manager_1", "hello")).toEqual({
      jsonrpc: "2.0",
      id: "request_1",
      method: "session/prompt",
      params: {
        sessionId: "manager_1",
        prompt: [{ type: "text", text: "hello" }],
      },
    });
  });

  it("rejects an empty prompt", () => {
    expect(() => buildE2EEPromptFrame("request_1", "manager_1", "  ")).toThrow(
      "Prompt is required",
    );
  });

  it("builds an encrypted ACP session lifecycle with a paxd-owned cwd", () => {
    expect(buildE2EESessionNewFrame("new_1", "/work/project")).toEqual({
      jsonrpc: "2.0",
      id: "new_1",
      method: "session/new",
      params: { cwd: "/work/project", mcpServers: [] },
    });
  });

  it("recognizes the encrypted session/new response without exposing native state", () => {
    expect(
      parseE2EERPCResponse({
        jsonrpc: "2.0",
        id: "new_1",
        result: { sessionId: "manager_1" },
      }),
    ).toEqual({
      requestId: "new_1",
      error: undefined,
    });
  });

  it("reads an encrypted ACP lifecycle error", () => {
    expect(
      parseE2EERPCResponse({
        jsonrpc: "2.0",
        id: "resume_1",
        error: { code: -32002, message: "route missing" },
      }),
    ).toEqual({
      requestId: "resume_1",
      error: "route missing",
    });
  });

  it("extracts streaming text from an ACP session update", () => {
    expect(
      extractE2EEFrameText({
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "streamed text" },
          },
        },
      }),
    ).toBe("streamed text");
  });
});
