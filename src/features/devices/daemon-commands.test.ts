import { describe, expect, it } from "vitest";
import type { DaemonCommandRecord, Node } from "@/features/api/types";
import {
  daemonCommandSnapshot,
  daemonCommandSteps,
  deviceCommandNote,
  foldDaemonCommandState,
  isDaemonCommandSettled,
  snapshotFromRecord,
} from "./daemon-commands";

function record(
  overrides: Partial<DaemonCommandRecord> = {},
): DaemonCommandRecord {
  return {
    command_id: "cmd_1",
    created_at: "2026-10-22T10:00:00Z",
    node_id: "node_1",
    state: "in_progress",
    status: "received",
    type: "paxl.upgrade",
    updated_at: "2026-10-22T10:00:00Z",
    ...overrides,
  };
}

function stepStates(steps: { state: string }[]) {
  return steps.map((step) => step.state);
}

describe("foldDaemonCommandState", () => {
  it("treats delivery and paxd failures as failed", () => {
    for (const status of ["failed", "rejected", "lost", "dispatch_failed"]) {
      expect(foldDaemonCommandState("paxl.upgrade", status)).toBe("failed");
    }
  });

  it("lets the maintenance confirmation decide paxd restarts and upgrades", () => {
    expect(
      foldDaemonCommandState("paxd.upgrade", "received", "awaiting_new_boot"),
    ).toBe("in_progress");
    expect(
      foldDaemonCommandState("paxd.upgrade", "applied", "awaiting_running"),
    ).toBe("in_progress");
    expect(
      foldDaemonCommandState("paxd.upgrade", "received", "confirmed"),
    ).toBe("succeeded");
    expect(
      foldDaemonCommandState("paxd.restart", "received", "version_mismatch"),
    ).toBe("failed");
    expect(foldDaemonCommandState("paxd.restart", "applied")).toBe("succeeded");
  });

  it("completes paxl upgrades only when paxd applied them", () => {
    expect(foldDaemonCommandState("paxl.upgrade", "received")).toBe(
      "in_progress",
    );
    expect(foldDaemonCommandState("paxl.upgrade", "applied")).toBe("succeeded");
  });
});

describe("daemonCommandSnapshot", () => {
  it("prefers the Manager record state over local folding", () => {
    const snapshot = daemonCommandSnapshot("paxd.upgrade", {
      command: { command_id: "cmd_1", status: "received" },
      daemon_command: record({
        state: "succeeded",
        target_version: "1.2.3",
        type: "paxd.upgrade",
      }),
      type: "command.get",
    });
    expect(snapshot.state).toBe("succeeded");
    expect(snapshot.expectedVersion).toBe("1.2.3");
  });

  it("folds the plain paxd view returned by older Managers", () => {
    const snapshot = daemonCommandSnapshot("paxl.upgrade", {
      command: {
        command_id: "cmd_1",
        result: { phase: "activating" },
        status: "received",
      },
      type: "command.get",
    });
    expect(snapshot).toMatchObject({
      phase: "activating",
      stale: false,
      state: "in_progress",
    });
  });

  it("falls back to the submit response before the first poll", () => {
    const snapshot = daemonCommandSnapshot("paxl.upgrade", undefined, {
      errorMessage: "tunnel closed",
      status: "dispatch_failed",
    });
    expect(snapshot.state).toBe("failed");
    expect(snapshot.errorMessage).toBe("tunnel closed");
  });
});

describe("isDaemonCommandSettled", () => {
  it("keeps polling paxd upgrades until the new boot confirms them", () => {
    const pending = {
      command: { command_id: "c", status: "received", type: "paxd.upgrade" },
      maintenance_confirmation: { status: "awaiting_new_boot" },
      type: "command.get",
    };
    expect(isDaemonCommandSettled(pending)).toBe(false);
    expect(
      isDaemonCommandSettled({
        ...pending,
        maintenance_confirmation: { status: "confirmed" },
      }),
    ).toBe(true);
    expect(isDaemonCommandSettled(undefined)).toBe(false);
  });
});

describe("daemonCommandSteps", () => {
  it("walks paxl upgrade phases", () => {
    const dispatching = daemonCommandSnapshot("paxl.upgrade", undefined, {
      status: "dispatching",
    });
    expect(stepStates(daemonCommandSteps("paxl.upgrade", dispatching))).toEqual(
      ["active", "pending", "pending", "pending"],
    );
    expect(
      stepStates(
        daemonCommandSteps(
          "paxl.upgrade",
          snapshotFromRecord(record({ phase: "activating" })),
        ),
      ),
    ).toEqual(["done", "done", "active", "pending"]);
    expect(
      stepStates(
        daemonCommandSteps(
          "paxl.upgrade",
          snapshotFromRecord(record({ state: "succeeded", status: "applied" })),
        ),
      ),
    ).toEqual(["done", "done", "done", "done"]);
  });

  it("marks the last seen paxl phase as the failing step", () => {
    const failed = snapshotFromRecord(
      record({ phase: "failed", state: "failed", status: "failed" }),
    );
    expect(
      stepStates(daemonCommandSteps("paxl.upgrade", failed, "activating")),
    ).toEqual(["done", "done", "failed", "pending"]);
    expect(stepStates(daemonCommandSteps("paxl.upgrade", failed))).toEqual([
      "done",
      "failed",
      "pending",
      "pending",
    ]);
  });

  it("follows paxd upgrade confirmations to the running version", () => {
    const steps = (confirmation?: string, state = "in_progress") =>
      daemonCommandSteps(
        "paxd.upgrade",
        snapshotFromRecord(
          record({
            maintenance_confirmation: confirmation
              ? { status: confirmation }
              : undefined,
            state: state as DaemonCommandRecord["state"],
            target_version: "1.2.3",
            type: "paxd.upgrade",
          }),
        ),
      );
    expect(stepStates(steps("awaiting_new_boot"))).toEqual([
      "done",
      "active",
      "pending",
      "pending",
    ]);
    expect(stepStates(steps("awaiting_running"))).toEqual([
      "done",
      "done",
      "active",
      "pending",
    ]);
    expect(stepStates(steps("version_mismatch", "failed"))).toEqual([
      "done",
      "done",
      "done",
      "failed",
    ]);
    expect(steps("confirmed", "succeeded").at(-1)).toEqual({
      label: "Running 1.2.3",
      state: "done",
    });
  });
});

describe("deviceCommandNote", () => {
  const node = (commands: DaemonCommandRecord[], extra: Partial<Node> = {}) =>
    ({ latest_daemon_commands: commands, node_id: "node_1", ...extra }) as Node;

  it("surfaces a running command before an older failure", () => {
    const note = deviceCommandNote(
      node([
        record({
          command_id: "failed",
          state: "failed",
          type: "paxd.restart",
        }),
        record({
          command_id: "running",
          created_at: "2026-10-22T09:00:00Z",
          target_version: "0.1.62",
        }),
      ]),
    );
    expect(note).toMatchObject({
      text: "Upgrading paxl → 0.1.62",
      tone: "busy",
    });
  });

  it("reports the newest failure that is not already installed", () => {
    expect(
      deviceCommandNote(
        node([
          record({
            state: "failed",
            target_version: "1.2.3",
            type: "paxd.upgrade",
          }),
        ]),
      ),
    ).toMatchObject({ text: "paxd upgrade failed", tone: "warning" });
    expect(
      deviceCommandNote(
        node(
          [
            record({
              state: "failed",
              target_version: "v1.2.3",
              type: "paxd.upgrade",
            }),
          ],
          { paxd_version: "1.2.3" },
        ),
      ),
    ).toBeUndefined();
  });

  it("ignores settled successes and commands the list does not track", () => {
    expect(
      deviceCommandNote(
        node([
          record({ state: "succeeded", status: "applied" }),
          record({ state: "failed", type: "harness.upgrade" }),
        ]),
      ),
    ).toBeUndefined();
    expect(deviceCommandNote({ node_id: "node_1" })).toBeUndefined();
  });
});
