import { describe, expect, it } from "vitest";
import {
  agentTypeLabel,
  normalizeAgentType,
  registeredAgentTypes,
} from "./agent-types";

describe("agent types", () => {
  it.each([
    ["claude", "claude-code"],
    [" Codex ", "codex"],
    ["claude-code", "claude-code"],
    ["", undefined],
    [undefined, undefined],
  ])("normalizes %s to %s", (value, type) => {
    expect(normalizeAgentType(value)).toBe(type);
  });

  it.each([
    ["claude-code", "Claude Code"],
    ["codex", "Codex"],
    ["kimi_code", "Kimi Code"],
  ])("labels %s as %s", (id, label) => {
    expect(agentTypeLabel(id)).toBe(label);
  });

  it("lists distinct registered types for one device, sorted by label", () => {
    expect(
      registeredAgentTypes(
        [
          { agent_id: "a", node_id: "one", agent_type: "codex" },
          { agent_id: "b", node_id: "one", agent_type: "claude" },
          { agent_id: "c", node_id: "one", agent_type: "codex" },
          { agent_id: "d", node_id: "two", agent_type: "kimi" },
          { agent_id: "e", node_id: "one" },
        ],
        "one",
      ),
    ).toEqual(["claude-code", "codex"]);
  });
});
