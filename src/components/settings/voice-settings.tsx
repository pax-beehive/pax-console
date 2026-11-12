"use client";

import { Mic } from "lucide-react";
import {
  SettingsChoice,
  SettingsChoices,
} from "@/components/ui/settings-controls";
import {
  useMicrophoneMode,
  writeMicrophoneMode,
} from "@/features/voice/microphone-preference";
import { settingsSection } from "./settings-catalog";
import { SettingsBack, SettingsPageHeader } from "./settings-navigation";

export function VoiceSettings() {
  const mode = useMicrophoneMode();
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="hidden lg:block">
        <SettingsPageHeader
          title="Voice input"
          category="Workspace"
          description={settingsSection("voice").description}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6 lg:px-8 lg:py-6">
        <div className="mx-auto w-full max-w-2xl lg:max-w-5xl">
          <div className="grid gap-5 lg:max-w-3xl">
            <header className="lg:hidden">
              <SettingsBack />
              <h1 className="text-2xl font-semibold">Voice input</h1>
              <p className="mt-2 text-sm text-ink-tertiary">
                Choose the microphone dictation uses on this device.
              </p>
            </header>
            <section className="grid gap-4 rounded-xl border border-hairline bg-surface-1 p-5 lg:p-6">
              <h2 className="flex items-center gap-2 font-medium">
                <Mic className="h-4 w-4" />
                Microphone on this device
              </h2>
              <SettingsChoices label="Dictation microphone">
                <SettingsChoice
                  label="Keep music playing"
                  description="Uses this phone's or computer's own microphone. Bluetooth earbuds keep playing audio while you dictate. Loud music from a speaker may be picked up."
                  selected={mode === "device"}
                  onClick={() => writeMicrophoneMode("device")}
                />
                <SettingsChoice
                  label="Headset microphone"
                  description="Uses call-style audio with echo cancellation, so a Bluetooth headset's microphone is used. Music pauses or sounds lower while you dictate."
                  selected={mode === "headset"}
                  onClick={() => writeMicrophoneMode("headset")}
                />
              </SettingsChoices>
              <p className="text-xs text-ink-tertiary">
                Saved in this browser only. Takes effect the next time you tap
                the microphone.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
