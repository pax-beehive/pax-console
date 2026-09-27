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
      "https://staging.example.test/api/v1/public/paxd/install.sh",
    );
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
