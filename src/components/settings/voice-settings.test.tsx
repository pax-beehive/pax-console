/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  microphoneConstraints,
  readMicrophoneMode,
} from "@/features/voice/microphone-preference";
import { VoiceSettings } from "./voice-settings";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/voice",
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

const values = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
});

afterEach(() => {
  cleanup();
  values.clear();
});

describe("voice microphone preference", () => {
  it("defaults to the device microphone without call processing", () => {
    expect(readMicrophoneMode()).toBe("device");
    expect(microphoneConstraints("device")).toEqual({
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });
    expect(microphoneConstraints("headset")).toMatchObject({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
  });

  it("switches and remembers the choice on this device", async () => {
    render(<VoiceSettings />);
    const keep = screen.getByRole("radio", { name: /Keep music playing/ });
    const headset = screen.getByRole("radio", { name: /Headset microphone/ });
    expect(keep).toHaveAttribute("aria-checked", "true");
    await userEvent.click(headset);
    expect(headset).toHaveAttribute("aria-checked", "true");
    expect(readMicrophoneMode()).toBe("headset");
    await userEvent.click(keep);
    expect(readMicrophoneMode()).toBe("device");
  });
});
