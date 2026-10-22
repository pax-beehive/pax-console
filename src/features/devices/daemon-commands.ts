import type {
  DaemonCommandRecord,
  DaemonCommandState,
  Node,
  NodeDaemonQueryResult,
  PaxlObservation,
} from "@/features/api/types";

/** Maintenance commands the device list and dialogs track. */
export type DeviceCommandKind =
  | "paxl.upgrade"
  | "paxd.upgrade"
  | "paxd.restart";

export const deviceCommandKinds: readonly DeviceCommandKind[] = [
  "paxd.upgrade",
  "paxd.restart",
  "paxl.upgrade",
];

const failedStatuses = new Set([
  "dispatch_failed",
  "failed",
  "lost",
  "rejected",
]);

export type DaemonCommandSnapshot = {
  confirmation?: string;
  errorMessage?: string;
  expectedVersion?: string;
  observedVersion?: string;
  phase?: string;
  /** paxd was unreachable; the data is Manager's last stored observation. */
  stale: boolean;
  state: DaemonCommandState;
  status?: string;
};

/**
 * Normalizes a command.get response. Manager-recorded commands carry
 * daemon_command with an authoritative state; older Managers only return the
 * paxd view, so the same folding rules are applied locally.
 */
export function daemonCommandSnapshot(
  kind: DeviceCommandKind,
  result?: NodeDaemonQueryResult,
  fallback?: { errorMessage?: string; status?: string },
): DaemonCommandSnapshot {
  const record = result?.daemon_command;
  const command = result?.command;
  const confirmation =
    record?.maintenance_confirmation ?? result?.maintenance_confirmation;
  const status = command?.status ?? record?.status ?? fallback?.status;
  const errorMessage =
    command?.error_message ||
    record?.error_message ||
    fallback?.errorMessage ||
    undefined;
  return {
    confirmation: confirmation?.status,
    errorMessage,
    expectedVersion: confirmation?.expected_version ?? record?.target_version,
    observedVersion: confirmation?.observed_version,
    phase: record?.phase || command?.result?.phase || undefined,
    stale: Boolean(result?.stale),
    state:
      record?.state ??
      foldDaemonCommandState(kind, status, confirmation?.status),
    status,
  };
}

export function snapshotFromRecord(
  record: DaemonCommandRecord,
): DaemonCommandSnapshot {
  return daemonCommandSnapshot(record.type as DeviceCommandKind, {
    daemon_command: record,
    type: "command.get",
  });
}

/**
 * Mirrors Manager's folding: paxd keeps restart and upgrade records at
 * "received" after the new process starts, so for those the heartbeat-based
 * maintenance confirmation decides completion.
 */
export function foldDaemonCommandState(
  kind: string,
  status?: string,
  confirmation?: string,
): DaemonCommandState {
  if (status && failedStatuses.has(status)) {
    return "failed";
  }
  if ((kind === "paxd.upgrade" || kind === "paxd.restart") && confirmation) {
    if (confirmation === "confirmed") {
      return "succeeded";
    }
    return confirmation === "version_mismatch" ? "failed" : "in_progress";
  }
  return status === "applied" ? "succeeded" : "in_progress";
}

export function isDaemonCommandSettled(result?: NodeDaemonQueryResult) {
  const kind = result?.daemon_command?.type ?? result?.command?.type;
  if (!result || !kind) {
    return false;
  }
  return (
    daemonCommandSnapshot(kind as DeviceCommandKind, result).state !==
    "in_progress"
  );
}

export type ProgressStepState = "active" | "done" | "failed" | "pending";

export type ProgressStep = {
  label: string;
  state: ProgressStepState;
};

const paxlPhases = ["downloading", "activating", "verifying"];

/**
 * Builds the step list shown in upgrade and restart dialogs. lastPhase is the
 * last in-progress paxl phase this client saw; paxd reports "failed" as the
 * final phase, so it locates the failing step.
 */
export function daemonCommandSteps(
  kind: DeviceCommandKind,
  snapshot: DaemonCommandSnapshot,
  lastPhase?: string,
): ProgressStep[] {
  if (kind === "paxl.upgrade") {
    return stepsAt(
      ["Sent to device", "Downloading", "Activating", "Verifying"],
      snapshot,
      paxlStepIndex(snapshot, lastPhase),
    );
  }
  const finalLabel =
    kind === "paxd.upgrade"
      ? `Running ${snapshot.expectedVersion || "new version"}`
      : "Back online";
  return stepsAt(
    [
      "Sent to device",
      kind === "paxd.upgrade"
        ? "Installing and restarting paxd"
        : "Restarting paxd",
      "Reconnecting",
      finalLabel,
    ],
    snapshot,
    maintenanceStepIndex(snapshot),
  );
}

function stepsAt(
  labels: string[],
  snapshot: DaemonCommandSnapshot,
  index: number,
): ProgressStep[] {
  return labels.map((label, i) => {
    if (snapshot.state === "succeeded" || i < index) {
      return { label, state: "done" };
    }
    if (i > index) {
      return { label, state: "pending" };
    }
    return { label, state: snapshot.state === "failed" ? "failed" : "active" };
  });
}

function paxlStepIndex(snapshot: DaemonCommandSnapshot, lastPhase?: string) {
  if (!snapshot.status || snapshot.status === "dispatching") {
    return 0;
  }
  if (snapshot.status === "dispatch_failed") {
    return 0;
  }
  const phase = paxlPhases.includes(snapshot.phase ?? "")
    ? snapshot.phase
    : lastPhase;
  const index = paxlPhases.indexOf(phase ?? "");
  return index >= 0 ? index + 1 : 1;
}

function maintenanceStepIndex(snapshot: DaemonCommandSnapshot) {
  if (
    !snapshot.status ||
    snapshot.status === "dispatching" ||
    snapshot.status === "dispatch_failed"
  ) {
    return 0;
  }
  switch (snapshot.confirmation) {
    case "awaiting_running":
      return 2;
    case "version_mismatch":
      return 3;
    default:
      return 1;
  }
}

export type DeviceCommandNote = {
  record: DaemonCommandRecord;
  text: string;
  tone: "busy" | "warning";
};

const commandLabels: Record<DeviceCommandKind, string> = {
  "paxd.restart": "paxd restart",
  "paxd.upgrade": "paxd upgrade",
  "paxl.upgrade": "paxl upgrade",
};

/**
 * Picks the one maintenance command worth surfacing on a device row: the
 * newest in-progress command, otherwise the newest failure that a later state
 * has not already superseded.
 */
export function deviceCommandNote(node: Node): DeviceCommandNote | undefined {
  const records = (node.latest_daemon_commands ?? [])
    .filter((record) =>
      deviceCommandKinds.includes(record.type as DeviceCommandKind),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const running = records.find((record) => record.state === "in_progress");
  if (running) {
    return { record: running, text: runningText(running), tone: "busy" };
  }
  const failed = records.find(
    (record) => record.state === "failed" && !failureSuperseded(node, record),
  );
  if (failed) {
    return {
      record: failed,
      text: `${commandLabels[failed.type as DeviceCommandKind]} failed`,
      tone: "warning",
    };
  }
  return undefined;
}

function runningText(record: DaemonCommandRecord) {
  const target = record.target_version ? ` → ${record.target_version}` : "";
  switch (record.type) {
    case "paxd.restart":
      return "Restarting paxd";
    case "paxd.upgrade":
      return `Upgrading paxd${target}`;
    default:
      return `Upgrading paxl${target}`;
  }
}

function failureSuperseded(node: Node, record: DaemonCommandRecord) {
  if (!record.target_version) {
    return false;
  }
  const installed =
    record.type === "paxd.upgrade"
      ? node.paxd_version
      : record.type === "paxl.upgrade"
        ? paxlObservation(node)?.version
        : undefined;
  return versionsEqual(installed, record.target_version);
}

export function paxlObservation(node: Node): PaxlObservation | undefined {
  const value = node.metadata?.paxl;
  if (
    !value ||
    typeof value !== "object" ||
    !("status" in value) ||
    typeof value.status !== "string"
  ) {
    return undefined;
  }
  return value as PaxlObservation;
}

export function versionsEqual(a?: string, b?: string) {
  if (!a || !b) {
    return false;
  }
  const normalize = (version: string) =>
    version.trim().toLowerCase().replace(/^v/, "");
  return normalize(a) === normalize(b);
}

/** The in-progress record of a kind, used to resume its dialog. */
export function activeDeviceCommand(node: Node, kind: DeviceCommandKind) {
  return node.latest_daemon_commands?.find(
    (record) => record.type === kind && record.state === "in_progress",
  );
}
