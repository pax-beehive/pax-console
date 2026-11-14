import { describe, expect, it } from "vitest";
import { ApiError, AuthError, UserMessageError } from "./errors";
import { isInputError, publicErrorMessage } from "./public-error";

describe("what a person is told when a request fails", () => {
  it.each([
    [new AuthError(), "Your sign-in has expired. Sign in again to continue."],
    [
      new ApiError("node not found", 404, {}),
      "This is no longer available. Reload the page and try again.",
    ],
    [
      new ApiError("version conflict", 409, {}),
      "This changed in the meantime. Reload the page and try again.",
    ],
    [
      new ApiError("slow down", 429, {}),
      "Too many requests. Try again in a moment.",
    ],
    [
      new ApiError("pq: connection refused", 503, {}),
      "PAX is having trouble right now. Try again in a moment.",
    ],
    [
      new ApiError("name is too long", 400, {}),
      "PAX did not accept this request.",
    ],
    [
      new TypeError("Failed to fetch"),
      "PAX could not be reached. Check your connection and try again.",
    ],
    [
      new TypeError("Cannot read properties of undefined"),
      "Something went wrong. Try again in a moment.",
    ],
    ["a thrown string", "Something went wrong. Try again in a moment."],
  ])("describes %s without the server's wording", (error, message) => {
    expect(publicErrorMessage(error)).toBe(message);
  });

  it("passes on a message that was written for the person", () => {
    expect(
      publicErrorMessage(new UserMessageError("The device has no such agent.")),
    ).toBe("The device has no such agent.");
  });

  it("treats only rejected input as something the server should explain", () => {
    expect(isInputError(new ApiError("name is too long", 400, {}))).toBe(true);
    expect(isInputError(new ApiError("invalid slots", 422, {}))).toBe(true);
    expect(isInputError(new ApiError("boom", 500, {}))).toBe(false);
    expect(isInputError(new Error("name is too long"))).toBe(false);
  });
});
