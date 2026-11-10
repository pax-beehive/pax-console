/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthError } from "@/features/api/errors";
import { DockerBrowserRoute } from "./docker-browser-page";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  viewer: vi.fn(),
}));

vi.mock("@/features/auth/use-current-user", () => ({
  useCurrentUser: mocks.user,
}));
vi.mock("@/features/auth/sign-in-redirect", () => ({
  SignInRedirect: () => <div>Redirecting to sign in</div>,
}));
vi.mock("./node-browser-vnc", () => ({
  NodeBrowserVNC: (props: unknown) => {
    mocks.viewer(props);
    return <section aria-label="Docker viewer">Preview</section>;
  },
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function mount() {
  return render(
    <TooltipProvider>
      <DockerBrowserRoute nodeId="node / 1" />
    </TooltipProvider>,
  );
}

it("waits for account access before mounting the remote desktop", () => {
  mocks.user.mockReturnValue({ isLoading: true });
  const view = mount();
  expect(screen.getByText("Checking PAX access...")).toBeVisible();
  expect(mocks.viewer).not.toHaveBeenCalled();

  mocks.user.mockReturnValue({
    data: { user_id: "owner" },
    isLoading: false,
    isError: false,
  });
  view.rerender(
    <TooltipProvider>
      <DockerBrowserRoute nodeId="node / 1" />
    </TooltipProvider>,
  );
  expect(mocks.viewer).toHaveBeenLastCalledWith({
    userId: "owner",
    nodeId: "node / 1",
    layout: "page",
  });
  expect(
    screen.getByRole("region", { name: "Docker viewer" }),
  ).toHaveTextContent("Preview");
  expect(screen.getByRole("link", { name: "Back to device" })).toHaveAttribute(
    "href",
    "/nodes/node%20%2F%201",
  );
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
});

it("keeps authentication failures outside the viewer", () => {
  mocks.user.mockReturnValue({
    isLoading: false,
    isError: true,
    error: new AuthError(),
  });
  mount();
  expect(screen.getByText("Redirecting to sign in")).toBeVisible();
  expect(mocks.viewer).not.toHaveBeenCalled();
});

it("owns the visual viewport only while the standalone page is mounted", () => {
  mocks.user.mockReturnValue({
    data: { user_id: "owner" },
    isLoading: false,
    isError: false,
  });
  const previous = document.documentElement.getAttribute(
    "data-console-viewport",
  );
  const view = mount();
  const page = screen.getByRole("main", { name: "Docker desktop page" });
  expect(document.documentElement).toHaveAttribute("data-console-viewport");
  expect(page.style.getPropertyValue("--console-viewport-height")).toBe(
    `${window.innerHeight}px`,
  );
  view.unmount();
  expect(document.documentElement.getAttribute("data-console-viewport")).toBe(
    previous,
  );
});
