import { describe, expect, it } from "vitest";
import { isSupportedSessionWorkspace } from "./workspace-path";

describe("isSupportedSessionWorkspace", () => {
  it.each([
    ["an absolute workspace", "/workspace/project", true],
    ["the home directory", "~", true],
    ["a workspace below home", "~/project", true],
    ["an ordinary relative workspace", "project", false],
    ["the current directory", "./project", false],
    ["the parent directory", "../project", false],
    ["another user's home", "~alice/project", false],
  ])("given %s, returns %s", (_name, workspace, expected) => {
    expect(isSupportedSessionWorkspace(workspace)).toBe(expected);
  });
});
