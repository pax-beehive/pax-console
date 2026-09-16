/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MessageAttachment } from "./message-attachment";

afterEach(cleanup);
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect() {}
      observe() {}
      unobserve() {}
    },
  );
});
afterAll(() => vi.unstubAllGlobals());

function renderAttachment(
  contentType = "image/png",
  attachmentId: string | undefined = "att_1",
) {
  return render(
    <TooltipProvider>
      <MessageAttachment
        userId="user_1"
        attachment={{
          attachmentId,
          filename: "Screenshot.png",
          contentType,
        }}
      />
    </TooltipProvider>,
  );
}

describe("sent attachment preview", () => {
  it("shows a lazy thumbnail and opens an accessible full-size preview", () => {
    renderAttachment();
    const image = screen.getByRole("img", { name: "Screenshot.png" });
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute(
      "src",
      "/api/pax/api/v1/user/user_1/attachments/att_1/content",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Preview Screenshot.png" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Screenshot.png" }),
    ).toBeVisible();
    expect(screen.getByRole("img", { name: "Screenshot.png" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the filename and retries through a fresh authenticated URL on failure", () => {
    renderAttachment();
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByText("Screenshot.png")).toBeVisible();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry preview" }));
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      expect.stringContaining("?retry=1"),
    );
  });

  it.each(["application/pdf", "image/svg+xml", "text/html"])(
    "keeps %s as a file label",
    (type) => {
      renderAttachment(type);
      expect(screen.getByText("Screenshot.png")).toBeVisible();
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    },
  );

  it("keeps unresolved legacy images as labels", () => {
    render(
      <TooltipProvider>
        <MessageAttachment
          userId="user_1"
          attachment={{
            filename: "legacy.png",
            contentType: "image/png",
          }}
        />
      </TooltipProvider>,
    );
    expect(screen.getByText("legacy.png")).toBeVisible();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
