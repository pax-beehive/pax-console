import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDeviceInstallCommand,
  buildDeviceSetupCommand,
  shellQuote,
} from "./add-device-command";

const setup = {
  script_url: "https://artifacts.custom-region.test/install.sh?setup=1",
  machine_url: "https://machine.custom-region.test",
};

describe("server-owned device setup commands", () => {
  it("uses the provided URLs without a region table or inline installer", () => {
    const command = buildDeviceInstallCommand(setup, "fake-token");
    expect(command).toContain(setup.script_url);
    expect(command).not.toContain("paxworkspace.net");
    expect(command).not.toContain("PAX_DOWNLOAD_URL");
    expect(command).not.toContain("case");
    expect(command.length).toBeLessThan(240);
    expect(buildDeviceSetupCommand(setup)).toContain(
      "PAX_REGISTRATION_TOKEN=''",
    );
  });
  it("quotes shell metacharacters as data", () => {
    expect(shellQuote("abc'$(whoami)\n`id`")).toBe(
      "'abc'\"'\"'$(whoami)\n`id`'",
    );
  });
  it.each([
    "file:///tmp/script",
    "http://remote.test/script",
    "https://user:password@example.test/script",
    "https://example.test/script#fragment",
  ])("rejects unsafe setup URL %s", (script_url) => {
    expect(() => buildDeviceInstallCommand({ ...setup, script_url })).toThrow();
  });
  it.each(["https://node.test/path", "https://node.test?secret=x"])(
    "rejects a non-origin machine endpoint %s",
    (machine_url) => {
      expect(() =>
        buildDeviceSetupCommand({ ...setup, machine_url }),
      ).toThrow();
    },
  );
});

it.each(["", "fake'$(exit 81)\n`exit 82`"])(
  "runs the short installed-device command with a literal token",
  (token) => {
    const dir = mkdtempSync(join(tmpdir(), "pax-setup-command-"));
    try {
      writeFileSync(
        join(dir, "paxd"),
        '#!/bin/bash\n[ "$PAX_REGISTRATION_TOKEN" = "$EXPECTED_TOKEN" ] || exit 90\nprintf "%s\\n" "$@"\n',
        { mode: 0o755 },
      );
      const result = spawnSync(
        "bash",
        ["-c", buildDeviceSetupCommand(setup, token)],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${dir}:${process.env.PATH}`,
            EXPECTED_TOKEN: token,
            PAX_REGISTRATION_TOKEN: "stale-token",
          },
        },
      );
      expect(result.status).toBe(0);
      expect(result.stdout.trim().split("\n")).toEqual([
        "setup",
        "--cloud-url",
        setup.machine_url,
        ...(token ? ["--registration-token-env"] : []),
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

it.each(["success", "browser", "download-error", "script-error"])(
  "runs generated bootstrap command through real curl: %s",
  async (scenario) => {
    const token = scenario === "browser" ? "" : "fake'$(exit 81)`exit 82`";
    const server = createServer((req, res) => {
      expect(req.headers["x-registration-token"]).toBeUndefined();
      expect(req.url).not.toContain("fake");
      if (scenario === "download-error") {
        res.writeHead(503);
        res.end();
        return;
      }
      res.end(
        `#!/bin/bash\n[ "$PAX_REGISTRATION_TOKEN" = "$EXPECTED_TOKEN" ] || exit 91\n${scenario === "script-error" ? "exit 7" : "printf connected"}\n`,
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Missing port");
      const command = buildDeviceInstallCommand(
        {
          ...setup,
          script_url: `http://127.0.0.1:${address.port}/install.sh?setup=1`,
        },
        token,
      );
      const result = await new Promise<{ code: number | null; stdout: string }>(
        (resolve, reject) => {
          const child = spawn("bash", ["-c", command], {
            env: {
              ...process.env,
              EXPECTED_TOKEN: token,
              PAX_REGISTRATION_TOKEN: "stale-token",
            },
          });
          let stdout = "";
          child.stdout.on("data", (data) => {
            stdout += data;
          });
          child.stderr.resume();
          child.once("error", reject);
          child.once("close", (code) => resolve({ code, stdout }));
        },
      );
      expect(result.code).toBe(
        scenario === "download-error"
          ? 22
          : scenario === "script-error"
            ? 7
            : 0,
      );
      expect(result.stdout).toBe(
        ["success", "browser"].includes(scenario) ? "connected" : "",
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);
