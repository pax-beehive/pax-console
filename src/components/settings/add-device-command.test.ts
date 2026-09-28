import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDeviceInstallCommand, shellQuote } from "./add-device-command";

afterEach(() => vi.unstubAllGlobals());
describe("device install command", () => {
  it("uses the current public deployment origin, not a private server address", () => {
    vi.stubGlobal("__PAX_RUNTIME_CONFIG__", {
      wsBaseUrl: "wss://staging.example.test",
    });
    const command = buildDeviceInstallCommand("one-time-token");
    expect(command).toContain(
      "PAXL_DOWNLOAD_URL='https://staging.example.test'",
    );
    expect(command).toContain(
      "PAX_DOWNLOAD_URL='https://staging.example.test'",
    );
    expect(command).toContain("/api/v1/public/paxl/install.sh");
    expect(command).toContain("/api/v1/public/paxd/install.sh");
    expect(command).toContain("PAX_CLOUD_URL='https://staging.example.test'");
    expect(command).toContain("PAX_SETUP_AFTER_INSTALL=1");
    expect(command).toContain("PAX_REGISTRATION_TOKEN='one-time-token'");
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
    "paxl-download",
    "paxl-install",
    "paxd-download",
    "paxd-install",
  ])("installs both tools in order and stops on %s failure", (failure) => {
    const dir = mkdtempSync(join(tmpdir(), "pax-device-command-"));
    try {
      const log = join(dir, "steps");
      writeFileSync(
        join(dir, "curl"),
        `#!/bin/bash
case "\${@: -1}" in
  https://staging.example.test/api/v1/public/paxl/install.sh) product=paxl ;;
  https://staging.example.test/api/v1/public/paxd/install.sh) product=paxd ;;
  *) exit 91 ;;
esac
printf '%s-download\\n' "$product" >> "$PAX_TEST_LOG"
if [ "$PAX_TEST_FAIL" = "$product-download" ]; then exit 22; fi
if [ "$product" = paxl ]; then
cat <<'SCRIPT'
[ "$PAXL_DOWNLOAD_URL" = https://staging.example.test ] || exit 92
[ -z "\${PAX_REGISTRATION_TOKEN:-}" ] || exit 93
printf 'paxl-install\\n' >> "$PAX_TEST_LOG"
[ "$PAX_TEST_FAIL" != paxl-install ] || exit 7
SCRIPT
else
cat <<'SCRIPT'
[ "$PAX_DOWNLOAD_URL" = https://staging.example.test ] || exit 94
[ "$PAX_CLOUD_URL" = https://staging.example.test ] || exit 95
[ "$PAX_SETUP_AFTER_INSTALL" = 1 ] || exit 96
[ "$PAX_REGISTRATION_TOKEN" = "$PAX_TEST_EXPECTED_TOKEN" ] || exit 97
printf 'paxd-install\\n' >> "$PAX_TEST_LOG"
[ "$PAX_TEST_FAIL" != paxd-install ] || exit 8
printf 'setup\\n' >> "$PAX_TEST_LOG"
SCRIPT
fi
`,
        { mode: 0o755 },
      );
      vi.stubGlobal("__PAX_RUNTIME_CONFIG__", {
        wsBaseUrl: "wss://staging.example.test",
      });
      const token = "fake'$(exit 81)\n`exit 82`";
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        PAX_TEST_LOG: log,
        PAX_TEST_FAIL: failure,
        PAX_TEST_EXPECTED_TOKEN: token,
      };
      delete env.PAX_REGISTRATION_TOKEN;
      const result = spawnSync(
        "bash",
        ["-c", buildDeviceInstallCommand(token)],
        { env, encoding: "utf8" },
      );
      const expectedSteps = [
        "paxl-download",
        "paxl-install",
        "paxd-download",
        "paxd-install",
        "setup",
      ];
      const failIndex = expectedSteps.indexOf(failure);
      expect(readFileSync(log, "utf8").trim().split("\n")).toEqual(
        failIndex < 0 ? expectedSteps : expectedSteps.slice(0, failIndex + 1),
      );
      expect(result.status).toBe(
        failure === "ok"
          ? 0
          : failure.endsWith("download")
            ? 22
            : failure === "paxl-install"
              ? 7
              : 8,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
