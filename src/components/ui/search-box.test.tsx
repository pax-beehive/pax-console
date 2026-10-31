/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchBox } from "./search-box";

describe("SearchBox", () => {
  it("forwards controlled input, accessible name and native form properties", () => {
    const change = vi.fn();
    render(
      <SearchBox
        aria-label="Query"
        name="q"
        value="database"
        onChange={change}
        maxLength={256}
      />,
    );
    const input = screen.getByRole("searchbox", { name: "Query" });
    expect(input).toHaveValue("database");
    expect(input).toHaveAttribute("name", "q");
    expect(input).toHaveAttribute("maxlength", "256");
    fireEvent.change(input, { target: { value: "data" } });
    expect(change).toHaveBeenCalledOnce();
  });
});
