/** A microphone as the browser lists it, reduced to what fallback needs. */
export type InputDevice = {
  deviceId: string;
  groupId: string;
  label: string;
};

// Chrome adds aliases for the system default and the Windows communications
// device ahead of the real devices.
const ALIAS_IDS = new Set(["default", "communications"]);
const BUILT_IN_LABEL =
  /built-?in|internal|macbook|imac|microphone array|内建|内置/i;

export function inputDevices(devices: MediaDeviceInfo[]): InputDevice[] {
  return devices
    .filter((device) => device.kind === "audioinput")
    .map(({ deviceId, groupId, label }) => ({ deviceId, groupId, label }));
}

/**
 * The real device behind the system default. Chrome lists a "default" alias
 * that shares its group with the real device; other browsers list the
 * default first.
 */
export function defaultInput(devices: InputDevice[]) {
  const alias = devices.find((device) => device.deviceId === "default");
  const real = devices.filter((device) => !ALIAS_IDS.has(device.deviceId));
  if (alias) {
    return (
      real.find(
        (device) => device.groupId && device.groupId === alias.groupId,
      ) ?? { ...alias, label: alias.label.replace(/^[^-]*-\s*/, "") }
    );
  }
  return real[0];
}

/**
 * The built-in microphone to retry with when the default one does not
 * respond, or undefined when there is no distinct built-in microphone.
 * Labels are empty until the site has microphone permission.
 */
export function builtInInput(
  devices: InputDevice[],
  current: InputDevice | undefined,
) {
  return devices.find(
    (device) =>
      !ALIAS_IDS.has(device.deviceId) &&
      device.label !== "" &&
      BUILT_IN_LABEL.test(device.label) &&
      device.deviceId !== current?.deviceId &&
      (!current?.groupId || device.groupId !== current.groupId),
  );
}

/** A device label without Chrome's trailing "(Bluetooth)"-style hints. */
export function deviceName(device: InputDevice) {
  return (
    device.label.replace(/\s*\([^)]*\)\s*$/, "") || "The default microphone"
  );
}
