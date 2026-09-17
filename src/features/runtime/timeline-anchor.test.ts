/* @vitest-environment jsdom */
import { expect, it, vi } from "vitest";
import {
  captureTimelineAnchor,
  restoreTimelineAnchor,
} from "./timeline-anchor";

it("keeps the visible row in place when older rows and new bottom output arrive together", () => {
  const container = document.createElement("div");
  const row = document.createElement("div");
  row.dataset.timelineId = "stable-message";
  container.append(row);
  vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
    top: 10,
  } as DOMRect);
  const bounds = vi.spyOn(row, "getBoundingClientRect");
  bounds.mockReturnValue({ top: 0, bottom: 80 } as DOMRect);
  container.scrollTop = 200;
  const anchor = captureTimelineAnchor(container);
  // A prepend adds 120px above; arbitrary new content below must not affect anchoring.
  bounds.mockReturnValue({ top: 120, bottom: 200 } as DOMRect);
  Object.defineProperty(container, "scrollHeight", { value: 5000 });
  expect(restoreTimelineAnchor(container, anchor)).toBe(true);
  expect(container.scrollTop).toBe(320);
});
