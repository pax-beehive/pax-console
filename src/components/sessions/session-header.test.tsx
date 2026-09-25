/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { it, expect } from "vitest";
import { SessionHeader } from "./session-header";
it("keeps identity and workspace visible without a second expanded header", () => {
  render(
    <SessionHeader details={<span>~/pax</span>}>
      <span>Pax / Agent</span>
    </SessionHeader>,
  );
  expect(screen.getByText("Pax / Agent")).toBeVisible();
  expect(screen.getByText("~/pax")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /Expand|Collapse/ }),
  ).not.toBeInTheDocument();
});
