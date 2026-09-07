/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionCommandInput } from "./session-command-input";
import type { SessionAvailableCommand } from "@/features/api/types";

const commands: SessionAvailableCommand[] = [
  { name: "status", description: "Show session status" },
  {
    name: "review",
    description: "Review changes",
    input: { hint: "review instructions" },
  },
  {
    name: "review-branch",
    description: "Review a branch",
    input: { hint: "branch name" },
  },
  { name: "$imagegen", description: "Generate images" },
];

afterEach(cleanup);

function Composer({
  catalog = commands,
  onSend = vi.fn(),
}: {
  catalog?: SessionAvailableCommand[];
  onSend?: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <SessionCommandInput
      commands={catalog}
      value={value}
      onValueChange={setValue}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) onSend(value);
      }}
    />
  );
}

function type(value: string) {
  const input = screen.getByRole("textbox");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  return input;
}

describe("session command completion", () => {
  it("filters commands, selects by keyboard, and sends only after selection", () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} />);
    const input = type("/");
    expect(screen.getAllByRole("option")).toHaveLength(4);
    type("/re");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue("/review-branch ");
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByText("branch name")).toBeVisible();
    type("/review-branch main");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("/review-branch main");
  });

  it("supports clicking skill names and Tab completion", () => {
    render(<Composer />);
    const input = type("/$");
    fireEvent.click(screen.getByRole("option"));
    expect(input).toHaveValue("/$imagegen ");
    type("/sta");
    fireEvent.keyDown(input, { key: "Tab" });
    expect(input).toHaveValue("/status ");
  });

  it("allows Escape and unknown commands to use normal sending", () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} />);
    const input = type("/status");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("/status");
    type("/unknown");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("/unknown");
  });

  it("does not complete during IME composition or inside ordinary prose", () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} />);
    const input = type("/re");
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(input).toHaveValue("/re");
    expect(onSend).not.toHaveBeenCalled();
    type("please run /re");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("updates an open catalog and removes suggestions when cleared", () => {
    const { rerender } = render(<Composer catalog={[]} />);
    type("/");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    rerender(<Composer />);
    expect(screen.getAllByRole("option")).toHaveLength(4);
    rerender(<Composer catalog={[]} />);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
