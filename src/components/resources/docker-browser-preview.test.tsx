/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { browserControl } from "@/features/browser-control/api";
import { DockerBrowserPreview } from "./docker-browser-preview";
vi.mock("@/features/browser-control/api", () => ({ browserControl: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(browserControl).mockReset();
});

it("recovers independent frames, suspends hidden polling and stops on unmount", async () => {
  vi.useFakeTimers();
  const frame = { frame: "one", image: "aW1hZ2U=", width: 800, height: 600 };
  vi.mocked(browserControl)
    .mockRejectedValueOnce(Error("offline"))
    .mockResolvedValue(frame);
  const view = render(<DockerBrowserPreview userId="u" nodeId="n" />);
  await act(async () => {});
  expect(screen.getByRole("status")).toHaveTextContent(
    "Retrying automatically",
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(screen.getByRole("img")).toHaveAttribute(
    "src",
    "data:image/jpeg;base64,aW1hZ2U=",
  );
  expect(browserControl).toHaveBeenCalledTimes(2);
  const visibility = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("hidden");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(browserControl).toHaveBeenCalledTimes(2);
  visibility.mockReturnValue("visible");
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(browserControl).toHaveBeenCalledTimes(3);
  expect(
    vi
      .mocked(browserControl)
      .mock.calls.every(
        (call) =>
          call[2] === "view" &&
          (call[3] as { source: string }).source === "docker",
      ),
  ).toBe(true);
  view.unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(browserControl).toHaveBeenCalledTimes(3);
});

it("does not restart polling when an in-flight preview completes after close", async () => {
  vi.useFakeTimers();
  let resolve!: (value: unknown) => void;
  vi.mocked(browserControl).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const view = render(<DockerBrowserPreview userId="u" nodeId="n" />);
  view.unmount();
  await act(async () => {
    resolve({ frame: "late", image: "aW1hZ2U=", width: 800, height: 600 });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(browserControl).toHaveBeenCalledOnce();
});
