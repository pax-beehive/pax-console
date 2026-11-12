import { describe, expect, it } from "vitest";
import {
  builtInInput,
  defaultInput,
  deviceName,
  type InputDevice,
} from "./microphone-devices";

const chrome: InputDevice[] = [
  {
    deviceId: "default",
    groupId: "g1",
    label: "Default - AirPods Max (Bluetooth)",
  },
  { deviceId: "pods", groupId: "g1", label: "AirPods Max (Bluetooth)" },
  {
    deviceId: "mac",
    groupId: "g2",
    label: "MacBook Air Microphone (Built-in)",
  },
];

describe("microphone devices", () => {
  it("finds the real default device behind Chrome's alias", () => {
    expect(defaultInput(chrome)?.deviceId).toBe("pods");
    expect(deviceName(defaultInput(chrome)!)).toBe("AirPods Max");
  });

  it("treats the first device as default without an alias", () => {
    expect(defaultInput(chrome.slice(1))?.deviceId).toBe("pods");
  });

  it("picks a distinct built-in microphone, or none", () => {
    expect(builtInInput(chrome, defaultInput(chrome))?.deviceId).toBe("mac");
    expect(builtInInput(chrome, chrome[2])).toBeUndefined();
    const unlabeled = chrome.map((device) => ({ ...device, label: "" }));
    expect(builtInInput(unlabeled, unlabeled[1])).toBeUndefined();
    expect(
      builtInInput(
        [
          {
            deviceId: "array",
            groupId: "w",
            label: "Microphone Array (Realtek)",
          },
        ],
        undefined,
      )?.deviceId,
    ).toBe("array");
  });
});
