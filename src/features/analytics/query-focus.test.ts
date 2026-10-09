// @vitest-environment jsdom
import { focusManager } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { installQueryFocus } from "./query-focus";

it("pauses the existing shell query intervals on window blur as well as hidden tabs", () => {
  let focused = true,
    visible = true;
  vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() =>
    visible ? "visible" : "hidden",
  );
  const cleanup = installQueryFocus();
  try {
    expect(focusManager.isFocused()).toBe(true);
    focused = false;
    window.dispatchEvent(new Event("blur"));
    expect(focusManager.isFocused()).toBe(false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(focusManager.isFocused()).toBe(false);
    focused = true;
    visible = false;
    window.dispatchEvent(new Event("focus"));
    expect(focusManager.isFocused()).toBe(false);
    visible = true;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(focusManager.isFocused()).toBe(true);
    window.dispatchEvent(new Event("pagehide"));
    expect(focusManager.isFocused()).toBe(false);
    window.dispatchEvent(new Event("pageshow"));
    expect(focusManager.isFocused()).toBe(true);
  } finally {
    cleanup();
    vi.restoreAllMocks();
  }
});
