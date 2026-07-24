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
});
