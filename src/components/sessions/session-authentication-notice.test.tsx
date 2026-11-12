/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthError } from "@/features/api/errors";
import { SessionAuthenticationNotice } from "./session-authentication-notice";

afterEach(cleanup);

function notice(
  error: Error | null,
  nodeId?: string,
  agentType = "claude-code",
) {
  return (
    <TooltipProvider>
      <SessionAuthenticationNotice
        error={error}
        nodeId={nodeId}
        sessionId="session & one"
        agentType={agentType}
      />
    </TooltipProvider>
  );
}

describe("session agent sign-in notice", () => {
  it("links the failed request to sign-in for its exact device and original session", () => {
    render(notice(new Error("Authentication required"), "node & one"));
    const url = new URL(
      screen
        .getByRole("link", { name: "Open Agent sign-in" })
        .getAttribute("href")!,
      "https://paxworkspace.net",
    );
    expect(url.pathname).toBe("/settings/agent-sign-in");
    expect(url.searchParams.get("node_id")).toBe("node & one");
    expect(url.searchParams.get("harness")).toBe("claude");
    expect(url.searchParams.get("session_id")).toBe("session & one");
    expect(screen.getByRole("alert")).toHaveTextContent("Sign-in required");
  });

  it.each([null, new AuthError(), new Error("Rate limit exceeded")])(
    "does not send unrelated errors to agent sign-in",
    (error) => {
      render(notice(error, "node_1"));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    },
  );

  it("does not guess a device when session ownership is unavailable", () => {
    render(notice(new Error("Authentication required")));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each(["gemini", "opencode", ""])(
    "does not offer Claude sign-in for unsupported or unknown agent type %s",
    (agentType) => {
      render(notice(new Error("Authentication required"), "node_1", agentType));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    },
  );

  it("selects Codex for a Codex authentication error", () => {
    render(notice(new Error("Authentication required"), "node_1", "codex"));
    expect(
      screen.getByRole("link", { name: "Open Agent sign-in" }),
    ).toHaveAttribute("href", expect.stringContaining("harness=codex"));
  });
});
