/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, UserMessageError } from "@/features/api/errors";
import { ErrorNotice } from "./error-notice";

const view = vi.hoisted(() => ({ admin: false }));
vi.mock("@/features/auth/use-admin-view", () => ({
  useAdminView: () => view.admin,
}));

afterEach(() => {
  cleanup();
  view.admin = false;
});

describe("an error shown to a person", () => {
  it("says what to do and keeps the server's wording away from customers", () => {
    render(<ErrorNotice error={new ApiError("pq: deadlock", 500, {})} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "PAX is having trouble right now. Try again in a moment.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("deadlock");
  });

  it("adds the server's wording for administrators", () => {
    view.admin = true;
    render(<ErrorNotice error={new ApiError("pq: deadlock", 500, {})} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "HTTP 500: pq: deadlock",
    );
  });

  it("tells everyone why their input was rejected", () => {
    render(<ErrorNotice error={new ApiError("name is too long", 400, {})} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "PAX did not accept this request.",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("name is too long");
  });

  it("shows a message written for the person as it is, and nothing when there is no error", () => {
    view.admin = true;
    const { rerender } = render(
      <ErrorNotice error={new UserMessageError("The device is offline.")} />,
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "The device is offline.",
    );
    rerender(<ErrorNotice error={null} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
