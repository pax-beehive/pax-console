/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NotificationsPage from "@/app/settings/notifications/page";
import SecretaryPage from "@/app/settings/secretary/page";
import SummariesPage from "@/app/settings/secretary/summaries/page";
import VoiceSettingsPage from "@/app/settings/voice/page";

const state = vi.hoisted(() => ({
  features: [] as string[],
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/gated",
  useRouter: () => ({ replace: state.replace }),
}));
vi.mock("@/features/flags/use-feature", () => ({
  useFeatures: () => ({
    ready: true,
    enabled: (feature: string) => state.features.includes(feature),
  }),
}));
vi.mock("@/features/auth/auth-gate", () => ({
  AuthGate: ({
    children,
  }: {
    children: (user: { user_id: string }) => ReactNode;
  }) => children({ user_id: "settings-user" }),
}));
vi.mock("@/components/shell/console-layout", () => ({
  ConsoleLayout: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/secretary/secretary-settings-page", () => ({
  SecretarySettingsPage: () => <h1>Secretary settings</h1>,
}));
vi.mock("@/components/secretary/secretary-summary-browser", () => ({
  SecretarySummariesPage: () => <h1>Secretary summaries</h1>,
}));
vi.mock("@/components/settings/notification-settings", () => ({
  NotificationSettings: () => <h1>Notification settings</h1>,
}));
vi.mock("@/components/settings/voice-settings", () => ({
  VoiceSettings: () => <h1>Voice settings</h1>,
}));

afterEach(() => {
  cleanup();
  state.features = [];
  vi.clearAllMocks();
});

const routes = [
  ["secretary", "Secretary settings", <SecretaryPage key="secretary" />],
  ["secretary", "Secretary summaries", <SummariesPage key="summaries" />],
  [
    "notifications",
    "Notification settings",
    <NotificationsPage key="notifications" />,
  ],
  ["voice_input", "Voice settings", <VoiceSettingsPage key="voice" />],
] as const;

describe("settings routes that belong to a feature", () => {
  it.each(routes)(
    "opens the %s route %s only when the feature is enabled",
    async (feature, heading, page) => {
      render(page);
      expect(
        screen.queryByRole("heading", { name: heading }),
      ).not.toBeInTheDocument();
      await waitFor(() =>
        expect(state.replace).toHaveBeenCalledWith("/settings"),
      );

      cleanup();
      state.replace.mockClear();
      state.features = [feature];
      render(page);
      expect(screen.getByRole("heading", { name: heading })).toBeVisible();
      expect(state.replace).not.toHaveBeenCalled();
    },
  );
});
