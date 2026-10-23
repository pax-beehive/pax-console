import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDeviceInstallCommand,
  buildDeviceSetupCommand,
  shellQuote,
} from "./add-device-command";

afterEach(() => vi.unstubAllGlobals());
describe("device install command", () => {
  it("uses the current public deployment origin, not a private server address", () => {
    vi.stubGlobal("__PAX_RUNTIME_CONFIG__", {
      wsBaseUrl: "wss://staging.example.test",
    });
    const command = buildDeviceInstallCommand("one-time-token");
    expect(command).toContain(
      "PAX_DOWNLOAD_URL='https://staging.example.test'",
    );
    expect(command).not.toContain("/api/v1/public/paxl/install.sh");
    expect(command).toContain("/api/v1/public/paxd/install.sh");
    expect(command).toContain("PAX_CLOUD_URL='https://staging.example.test'");
    expect(command).toContain("PAX_SETUP_AFTER_INSTALL=1");
    expect(command).toContain("PAX_REGISTRATION_TOKEN='one-time-token'");
  });
  it.each([
    [
      "wss://paxworkspace.net",
      "https://api.paxworkspace.net",
      "https://wsapi.paxworkspace.net",
    ],
    [
      "wss://stage.paxworkspace.net",
      "https://stage-api.paxworkspace.net",
      "https://stage-wsapi.paxworkspace.net",
    ],
    [
      "wss://ws.lakeward.net",
      "https://api.lakeward.net",
      "https://api.lakeward.net",
    ],
    ["ws://localhost:9879", "http://localhost:9879", "http://localhost:9879"],
    [
      "wss://hk-api.paxworkspace.net",
      "https://hk-api.paxworkspace.net",
      "https://hk-wsapi.paxworkspace.net",
    ],
  ])("generates a Manager install URL for %s", (wsBaseUrl, origin, cloud) => {
    vi.stubGlobal("__PAX_RUNTIME_CONFIG__", { wsBaseUrl });
    const command = buildDeviceInstallCommand("fake-token");
    expect(command).toContain(`PAX_DOWNLOAD_URL='${origin}'`);
    expect(command).toContain(`PAX_CLOUD_URL='${cloud}'`);
  });
  it("quotes shell metacharacters as data", () => {
    expect(shellQuote("abc'$(whoami)\n`id`")).toBe(
      "'abc'\"'\"'$(whoami)\n`id`'",
    );
  });
});

// Execute the copied command with a fake curl; never download/install binaries
// or register a real device. Verify shell behavior, not just string fragments.
describe("quick-connect shell execution", () => {
  it.each([
    "ok",
    "paxd-download",
    "paxd-install",
    "browser",
    "paxd-html",
    "paxd-empty",
    "paxd-partial",
  ])("runs one installer and stops on %s failure", (failure) => {
    const dir = mkdtempSync(join(tmpdir(), "pax-device-command-"));
    try {
      const log = join(dir, "steps");
      writeFileSync(
        join(dir, "curl"),
        `#!/bin/bash
case "\${@: -1}" in
  https://staging.example.test/api/v1/public/paxd/install.sh) product=paxd ;;
  *) exit 91 ;;
esac
printf '%s-download\\n' "$product" >> "$PAX_TEST_LOG"
if [ "$PAX_TEST_FAIL" = "$product-download" ]; then exit 22; fi
if [ "$PAX_TEST_FAIL" = "$product-html" ]; then
  printf '<!DOCTYPE html>\\n<html>Login</html>\\n'; exit 0
fi
if [ "$PAX_TEST_FAIL" = "$product-empty" ]; then exit 0; fi
if [ "$PAX_TEST_FAIL" = "$product-partial" ]; then
  printf '#!/usr/bin/env bash\\nprintf executed >> "$PAX_TEST_LOG"\\n'; exit 18
fi
cat <<'SCRIPT'
#!/usr/bin/env bash
[ "$PAX_DOWNLOAD_URL" = https://staging.example.test ] || exit 94
[ "$PAX_CLOUD_URL" = https://staging.example.test ] || exit 95
[ "$PAX_SETUP_AFTER_INSTALL" = 1 ] || exit 96
[ "$PAX_REGISTRATION_TOKEN" = "$PAX_TEST_EXPECTED_TOKEN" ] || exit 97
printf 'paxd-install\\n' >> "$PAX_TEST_LOG"
[ "$PAX_TEST_FAIL" != paxd-install ] || exit 8
printf 'setup\\n' >> "$PAX_TEST_LOG"
SCRIPT
`,
        { mode: 0o755 },
      );
      vi.stubGlobal("__PAX_RUNTIME_CONFIG__", {
        wsBaseUrl: "wss://staging.example.test",
      });
      const token = failure === "browser" ? "" : "fake'$(exit 81)\n`exit 82`";
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        PAX_TEST_LOG: log,
        PAX_TEST_FAIL: failure,
        PAX_TEST_EXPECTED_TOKEN: token,
      };
      env.PAX_REGISTRATION_TOKEN = "stale-token-from-another-account";
      const result = spawnSync(
        "bash",
        ["-c", buildDeviceInstallCommand(token)],
        { env, encoding: "utf8" },
      );
      const expectedSteps = ["paxd-download", "paxd-install", "setup"];
      const rejectedResponse = /-(html|empty|partial)$/.test(failure);
      const failIndex = expectedSteps.indexOf(
        rejectedResponse ? "paxd-download" : failure,
      );
      expect(readFileSync(log, "utf8").trim().split("\n")).toEqual(
        failIndex < 0 ? expectedSteps : expectedSteps.slice(0, failIndex + 1),
      );
      if (rejectedResponse && !failure.endsWith("partial")) {
        expect(result.stderr).toContain("Expected a shell installer");
        expect(result.stderr).not.toContain("syntax error");
      }
      expect(result.status).toBe(
        failure === "ok" || failure === "browser"
          ? 0
          : failure.endsWith("partial")
            ? 18
            : rejectedResponse
              ? 1
              : failure.endsWith("download")
                ? 22
                : 8,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Use real curl against a local HTTP server as well as the failure-injection
// fixture above, including a successful HTTP redirect to a login page.
describe("quick-connect HTTP execution", () => {
  it.each(["script", "login"])(
    "handles an HTTP %s response",
    async (response) => {
      const requests: string[] = [];
      const server = createServer((req, res) => {
        requests.push(req.url ?? "");
        if (response === "login" && req.url !== "/login") {
          res.writeHead(302, { Location: "/login" });
          res.end();
        } else if (response === "login") {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<!DOCTYPE html>\n<html>Sign in</html>");
        } else {
          res.writeHead(200, { "Content-Type": "text/x-shellscript" });
          res.end('#!/usr/bin/env bash\nprintf "installed\\n"\n');
        }
      });
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      try {
        const address = server.address();
        if (!address || typeof address === "string")
          throw new Error("Missing port");
        vi.stubGlobal("__PAX_RUNTIME_CONFIG__", {
          wsBaseUrl: `ws://127.0.0.1:${address.port}`,
        });
        const result = await new Promise<{
          code: number | null;
          stdout: string;
          stderr: string;
        }>((resolve, reject) => {
          const child = spawn("bash", [
            "-c",
            buildDeviceInstallCommand("fake-token"),
          ]);
          let stdout = "";
          let stderr = "";
          child.stdout.on("data", (data) => {
            stdout += data;
          });
          child.stderr.on("data", (data) => {
            stderr += data;
          });
          child.once("error", reject);
          child.once("close", (code) => resolve({ code, stdout, stderr }));
        });
        if (response === "script") {
          expect(result).toEqual({
            code: 0,
            stdout: "installed\n",
            stderr: "",
          });
          expect(requests).toEqual(["/api/v1/public/paxd/install.sh"]);
        } else {
          expect(result.code).toBe(1);
          expect(result.stdout).toBe("");
          expect(result.stderr).toContain("Expected a shell installer");
          expect(result.stderr).not.toContain("syntax error");
          expect(requests).toEqual([
            "/api/v1/public/paxd/install.sh",
            "/login",
          ]);
        }
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    },
  );
});

describe("regional registration commands", () => {
  it.each(["hk", "us"])(
    "uses the token's %s region despite a US browser override",
    async (region) => {
      const { bootstrapRegion, loadRegionConfig } =
        await import("@/features/region/bootstrap");
      vi.stubGlobal("window", {
        location: { origin: "https://paxworkspace.net" },
      });
      vi.stubGlobal("__PAX_RUNTIME_CONFIG__", {
        wsBaseUrl: "wss://api.paxworkspace.net",
      });
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json({ status: "ready", region, user_id: "usr_test" }),
        ),
      );
      try {
        await bootstrapRegion();
        const prefix = region === "hk" ? "hk-" : "";
        const install = buildDeviceInstallCommand("fake-token");
        expect(install).toContain(
          `PAX_DOWNLOAD_URL='https://${prefix}api.paxworkspace.net'`,
        );
        expect(install).toContain(
          `PAX_CLOUD_URL='https://${prefix}wsapi.paxworkspace.net'`,
        );
        expect(buildDeviceSetupCommand("fake-token")).toBe(
          `PAX_REGISTRATION_TOKEN='fake-token' paxd setup --cloud-url 'https://${prefix}wsapi.paxworkspace.net' --registration-token-env`,
        );
        expect(buildDeviceSetupCommand()).toBe(
          `PAX_REGISTRATION_TOKEN='' paxd setup --cloud-url 'https://${prefix}wsapi.paxworkspace.net'`,
        );
      } finally {
        vi.stubGlobal(
          "fetch",
          vi.fn(async () => Response.json({ enabled: false })),
        );
        await loadRegionConfig();
      }
    },
  );
});

it.each(["", "fake'$(exit 81)\n`exit 82`"])(
  "executes the short command with a literal token",
  (token) => {
    const dir = mkdtempSync(join(tmpdir(), "pax-setup-command-"));
    try {
      writeFileSync(
        join(dir, "paxd"),
        '#!/bin/bash\n[ "$PAX_REGISTRATION_TOKEN" = "$EXPECTED_TOKEN" ] || exit 90\nprintf "%s\\n" "$@"\n',
        { mode: 0o755 },
      );
      vi.stubGlobal("__PAX_RUNTIME_CONFIG__", {
        wsBaseUrl: "wss://api.paxworkspace.net",
      });
      const result = spawnSync("bash", ["-c", buildDeviceSetupCommand(token)], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          EXPECTED_TOKEN: token,
          PAX_REGISTRATION_TOKEN: "stale-token",
        },
      });
      expect(result.status).toBe(0);
      expect(result.stdout.trim().split("\n")).toEqual([
        "setup",
        "--cloud-url",
        "https://wsapi.paxworkspace.net",
        ...(token ? ["--registration-token-env"] : []),
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
