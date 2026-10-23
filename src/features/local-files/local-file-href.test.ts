import { describe, expect, it } from "vitest";
import { isLocalFileHref, parseLocalFileHref } from "./local-file-href";

describe("parseLocalFileHref", () => {
  it.each([
    ["/Users/me/proj/out/report.md", { path: "/Users/me/proj/out/report.md" }],
    [
      "/Users/me/proj/out/report.md:12",
      { path: "/Users/me/proj/out/report.md", line: 12 },
    ],
    [
      "/Users/me/proj/app.ts:12:5",
      { path: "/Users/me/proj/app.ts", line: 12, column: 5 },
    ],
    ["/home/me/app.ts#L12", { path: "/home/me/app.ts", line: 12 }],
    ["/home/me/app.ts#L12-L20", { path: "/home/me/app.ts", line: 12 }],
    ["/private/tmp/output.txt", { path: "/private/tmp/output.txt" }],
    ["/tmp/x.log", { path: "/tmp/x.log" }],
    ["/var/log/app.log", { path: "/var/log/app.log" }],
    ["/opt/app/config.yaml", { path: "/opt/app/config.yaml" }],
    ["/workspace/repo/a.go", { path: "/workspace/repo/a.go" }],
    ["/workspaces/repo/a.go", { path: "/workspaces/repo/a.go" }],
    ["/mnt/data/a.csv", { path: "/mnt/data/a.csv" }],
    ["/Volumes/Disk/a.csv", { path: "/Volumes/Disk/a.csv" }],
    ["/Users", { path: "/Users" }],
    ["file:///Users/me/app.ts", { path: "/Users/me/app.ts" }],
    ["file://localhost/Users/me/app.ts", { path: "/Users/me/app.ts" }],
    ["file:/Users/me/app.ts:7", { path: "/Users/me/app.ts", line: 7 }],
    ["file:///Users/me/my%20file.md", { path: "/Users/me/my file.md" }],
    [
      "/Users/me/%E9%A1%B9%E7%9B%AE/a.md:3",
      { path: "/Users/me/项目/a.md", line: 3 },
    ],
    // Malformed percent-encoding falls back to the raw value.
    ["/Users/me/100%/a.md", { path: "/Users/me/100%/a.md" }],
    ["file:///Users/me/100%.md#L4", { path: "/Users/me/100%.md", line: 4 }],
    ["C:\\Users\\me\\app.ts", { path: "C:\\Users\\me\\app.ts" }],
    ["C:\\Users\\me\\app.ts:3", { path: "C:\\Users\\me\\app.ts", line: 3 }],
    ["C:/Users/me/app.ts#L9", { path: "C:/Users/me/app.ts", line: 9 }],
    ["file:///C:/Users/me/app.ts", { path: "C:/Users/me/app.ts" }],
    ["%2FUsers%2Fme%2Fa.md", { path: "/Users/me/a.md" }],
  ])("parses %s", (href, expected) => {
    expect(parseLocalFileHref(href)).toEqual(expected);
  });

  it.each([
    "https://example.com/Users/me/a.md",
    "/sessions/sess_1",
    "/artifacts/publications/pub_1",
    "relative/path.md",
    "#heading",
    "mailto:me@example.com",
    "",
  ])("rejects non-local href %s", (href) => {
    expect(parseLocalFileHref(href)).toBeNull();
    expect(isLocalFileHref(href)).toBe(false);
  });

  it("keeps non-line colon suffixes as part of the path", () => {
    expect(parseLocalFileHref("/Users/me/notes:draft")).toEqual({
      path: "/Users/me/notes:draft",
    });
  });
});
