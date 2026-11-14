/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollaborationRoute } from "./collaboration-route";
import type { User } from "@/features/api/types";
import type { ReactNode } from "react";

const fixtures = vi.hoisted(() => ({
  ready: false,
  enabled: false,
  mountPage: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@/features/auth/auth-gate", () => ({
  AuthGate: ({ children }: { children: (user: User) => ReactNode }) =>
    children({ user_id: "member_1" }),
}));
vi.mock("@/features/flags/use-feature", () => ({
  useFeatures: () => ({
    ready: fixtures.ready,
    enabled: () => fixtures.enabled,
  }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/collaboration/teams",
  useRouter: () => ({ replace: fixtures.replace }),
}));
vi.mock("./teams-page-client", () => ({
  TeamsPageClient: () => {
    fixtures.mountPage();
    return <div>Teams page</div>;
  },
}));
vi.mock("./friends-page-client", () => ({
  FriendsPageClient: () => {
    fixtures.mountPage();
    return <div>Friends page</div>;
  },
}));
vi.mock("./envelopes-page-client", () => ({
  EnvelopesPageClient: () => {
    fixtures.mountPage();
    return <div>Envelopes page</div>;
  },
}));
vi.mock("./knowledge-page-client", () => ({
  KnowledgePageClient: () => {
    fixtures.mountPage();
    return <div>Knowledge page</div>;
  },
}));

afterEach(() => {
  cleanup();
  fixtures.ready = false;
  fixtures.enabled = false;
  fixtures.mountPage.mockClear();
  fixtures.replace.mockReset();
});

describe("Given a direct Collaboration URL", () => {
  it("does not mount page queries before feature resolution", () => {
    render(<CollaborationRoute kind="teams" />);
    expect(fixtures.mountPage).not.toHaveBeenCalled();
    expect(fixtures.replace).not.toHaveBeenCalled();
  });

  it("returns home without mounting protected page queries when disabled", () => {
    fixtures.ready = true;
    render(<CollaborationRoute kind="teams" />);
    expect(fixtures.mountPage).not.toHaveBeenCalled();
    expect(fixtures.replace).toHaveBeenCalledWith("/");
  });

  it.each([
    ["teams", "Teams"],
    ["friends", "Friends"],
    ["envelopes", "Envelopes"],
    ["knowledge", "Knowledge"],
  ] as const)(
    "opens the %s page for a granted ordinary user",
    (kind, label) => {
      fixtures.ready = true;
      fixtures.enabled = true;
      render(<CollaborationRoute kind={kind} />);
      expect(screen.getByText(`${label} page`)).toBeInTheDocument();
      expect(fixtures.mountPage).toHaveBeenCalledOnce();
    },
  );
});
