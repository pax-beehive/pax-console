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
import userEvent from "@testing-library/user-event";
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
    const close = screen.getByRole("button", { name: "Close preview" });
    expect(close).toHaveFocus();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.click(close);
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

const gallery = [
  { attachmentId: "att_1", filename: "First.png", contentType: "image/png" },
  {
    attachmentId: "doc",
    filename: "Notes.pdf",
    contentType: "application/pdf",
  },
  { attachmentId: "att_2", filename: "Second.jpg", contentType: "image/jpeg" },
  { filename: "Unresolved.png", contentType: "image/png" },
  { attachmentId: "att_3", filename: "Third.webp", contentType: "image/webp" },
];
function renderGallery() {
  return render(
    <TooltipProvider>
      <MessageAttachment
        userId="user_1"
        attachment={gallery[2]}
        gallery={gallery}
      />
    </TooltipProvider>,
  );
}
it("navigates images in attachment order with buttons and arrow keys, preserving the opening image", async () => {
  const user = userEvent.setup();
  renderGallery();
  const trigger = screen.getByRole("button", { name: "Preview Second.jpg" });
  await user.click(trigger);
  expect(
    screen.getByRole("status", { name: "Image position" }),
  ).toHaveTextContent("2 / 3");
  expect(screen.getByRole("button", { name: "Close preview" })).toHaveFocus();
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Next image" }));
  expect(screen.getByRole("dialog", { name: "Third.webp" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Next image" })).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowLeft" });
  expect(screen.getByRole("dialog", { name: "Second.jpg" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Previous image" }));
  expect(screen.getByRole("dialog", { name: "First.png" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Previous image" })).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
  expect(
    screen.getByRole("status", { name: "Image position" }),
  ).toHaveTextContent("2 / 3");
  await user.click(screen.getByRole("button", { name: "Close preview" }));
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  expect(screen.getByRole("dialog", { name: "Second.jpg" })).toBeVisible();
});
it("keeps navigation working after an image fails and retries only that image", async () => {
  const user = userEvent.setup();
  renderGallery();
  await user.click(screen.getByRole("button", { name: "Preview Second.jpg" }));
  fireEvent.error(screen.getByRole("img", { name: "Second.jpg" }));
  await user.click(screen.getByRole("button", { name: "Retry preview" }));
  expect(screen.getByRole("img", { name: "Second.jpg" })).toHaveAttribute(
    "src",
    "/api/pax/api/v1/user/user_1/attachments/att_2/content?retry=1",
  );
  fireEvent.error(screen.getByRole("img", { name: "Second.jpg" }));
  await user.click(screen.getByRole("button", { name: "Next image" }));
  expect(screen.getByRole("img", { name: "Third.webp" })).toBeVisible();
  expect(screen.queryByText("Preview unavailable")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Close preview" }));
  expect(
    screen.getByRole("button", { name: "Preview Second.jpg" }),
  ).toBeVisible();
});
it("does not show gallery controls for a single image", () => {
  renderAttachment();
  fireEvent.click(
    screen.getByRole("button", { name: "Preview Screenshot.png" }),
  );
  expect(
    screen.queryByRole("button", { name: "Previous image" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Next image" }),
  ).not.toBeInTheDocument();
});
