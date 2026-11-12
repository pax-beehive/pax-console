import { describe, expect, it } from "vitest";
import { ApiError, AuthError } from "@/features/api/errors";
import { isAgentAuthenticationError } from "./agent-auth-error";

describe("agent authentication recovery", () => {
  it.each([
    "Authentication required",
    "Failed to authenticate: OAuth session expired and could not be refreshed",
  ])("recognizes an explicit agent request error: %s", (message) => {
    expect(isAgentAuthenticationError(new Error(message))).toBe(true);
  });

  it("recognizes a conversation business error delivered over SSE", () => {
    expect(
      isAgentAuthenticationError(
        new ApiError("Authentication required", 500, { type: "error" }),
      ),
    ).toBe(true);
  });

  it.each([
    null,
    undefined,
    new Error("Rate limit exceeded"),
    new Error("Connection closed"),
    new Error("Example: Authentication required"),
    new AuthError("Authentication required"),
    new ApiError("Authentication required", 401, null),
  ])(
    "does not treat unrelated or website authentication failures as agent sign-in",
    (error) => {
      expect(isAgentAuthenticationError(error)).toBe(false);
    },
  );
});
