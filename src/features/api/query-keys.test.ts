import { describe, expect, it } from "vitest";

import { queryKeys } from "./query-keys";

describe("queryKeys", () => {
  it("keeps the user session list separate from session observer resources", () => {
    const listRoot = queryKeys.userSessionsRoot("user-1");
    const list = queryKeys.userSessions("user-1", { pageSize: 20 });
    const history = queryKeys.sessionHistory("user-1", "session-1");

    expect(list.slice(0, listRoot.length)).toEqual(listRoot);
    expect(history.slice(0, listRoot.length)).not.toEqual(listRoot);
  });

  it("includes the primary project in a session-list cache identity", () => {
    expect(
      queryKeys.userSessions("user-1", {
        includeArchived: true,
        pageSize: 20,
        primaryProjectId: "proj-1",
      }),
    ).toContainEqual({
      agentIds: [],
      includeArchived: true,
      nodeIds: [],
      pageSize: 20,
      primaryProjectId: "proj-1",
    });
  });

  it("keeps project lists, details, and nested targets under one invalidation root", () => {
    const root = queryKeys.projectsRoot("user-1");
    const list = queryKeys.projects("user-1");
    const detail = queryKeys.project("user-1", "proj-1");
    const targets = queryKeys.projectTargets("user-1", "proj-1");

    expect(list.slice(0, root.length)).toEqual(root);
    expect(detail.slice(0, root.length)).toEqual(root);
    expect(targets.slice(0, root.length)).toEqual(root);
  });
});
