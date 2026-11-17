/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { DiscreteSlider } from "./discrete-slider";
import { FeatureStageControl } from "@/components/admin/config/feature-stage-control";
import { useLocaleStore } from "@/features/i18n/locale-store";

const options = [
  { value: "off", label: "Off" },
  { value: "admin", label: "Admin only" },
  { value: "beta", label: "Beta" },
  { value: "ga", label: "General availability" },
] as const;
const capture = vi.fn();
const release = vi.fn();
beforeEach(() => {
  vi.stubGlobal(
    "PointerEvent",
    class extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    },
  );
  HTMLElement.prototype.setPointerCapture = capture;
  HTMLElement.prototype.releasePointerCapture = release;
  HTMLElement.prototype.hasPointerCapture = () => true;
  useLocaleStore.setState({ locale: "en" });
});
afterEach(() => {
  cleanup();
  capture.mockReset();
  release.mockReset();
  vi.unstubAllGlobals();
  useLocaleStore.setState({ locale: "en" });
});
function slider() {
  return screen.getByRole("slider", { name: "Secretary scope" });
}
function begin() {
  fireEvent.pointerDown(slider(), { pointerId: 7, button: 0 });
}
function change(index: number) {
  fireEvent.change(slider(), { target: { value: String(index) } });
}
function mount(props: Partial<Parameters<typeof DiscreteSlider>[0]> = {}) {
  const onValueChange = vi.fn();
  const onValueCommit = vi.fn();
  const view = render(
    <DiscreteSlider
      options={options}
      value="admin"
      aria-label="Secretary scope"
      onValueChange={onValueChange}
      onValueCommit={onValueCommit}
      {...props}
    />,
  );
  return { ...view, onValueChange, onValueCommit };
}

describe("Given a discrete scope slider", () => {
  it("uses one native stepped range with readable value text and clickable options", () => {
    mount({ "aria-describedby": "scope-detail" });
    expect(
      screen.getByRole("group", { name: "Secretary scope" }),
    ).toContainElement(slider());
    expect(slider()).toHaveAttribute("type", "range");
    expect(slider()).toHaveAttribute("min", "0");
    expect(slider()).toHaveAttribute("max", "3");
    expect(slider()).toHaveAttribute("step", "1");
    expect(slider()).toHaveValue("1");
    expect(slider()).toHaveAttribute("aria-valuetext", "Admin only");
    expect(slider()).toHaveAttribute("aria-describedby", "scope-detail");
    expect(screen.getByRole("button", { name: "Admin only" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getAllByRole("button")).toHaveLength(4);
  });

  it("previews during a drag and commits only the final value on pointer release", () => {
    const { onValueChange, onValueCommit } = mount();
    begin();
    change(2);
    expect(slider()).toHaveAttribute("aria-valuetext", "Beta");
    change(3);
    expect(slider()).toHaveAttribute("aria-valuetext", "General availability");
    expect(onValueChange.mock.calls).toEqual([["beta"], ["ga"]]);
    expect(onValueCommit).not.toHaveBeenCalled();
    expect(capture).toHaveBeenCalledWith(7);
    fireEvent.pointerUp(slider(), { pointerId: 7 });
    expect(onValueCommit).toHaveBeenCalledExactlyOnceWith("ga");
    expect(release).toHaveBeenCalledWith(7);
    // Lists keep their effective server value until the parent saves it.
    expect(slider()).toHaveValue("1");
    expect(slider()).toHaveAttribute("aria-valuetext", "Admin only");
  });

  it("does not commit when a drag returns to its starting stop", () => {
    const { onValueCommit } = mount();
    begin();
    change(3);
    change(1);
    fireEvent.pointerUp(slider(), { pointerId: 7 });
    expect(onValueCommit).not.toHaveBeenCalled();
  });

  it.each(["pointerCancel", "lostPointerCapture"] as const)(
    "restores the original preview after %s without committing",
    (event) => {
      const { onValueChange, onValueCommit } = mount();
      begin();
      change(2);
      fireEvent[event](slider(), { pointerId: 7 });
      expect(slider()).toHaveValue("1");
      expect(onValueChange).toHaveBeenLastCalledWith("admin");
      expect(onValueCommit).not.toHaveBeenCalled();
      fireEvent.pointerUp(slider(), { pointerId: 7 });
      expect(onValueCommit).not.toHaveBeenCalled();
    },
  );

  it("ignores a different pointer while a captured drag is active", () => {
    const { onValueCommit } = mount();
    begin();
    change(2);
    fireEvent.pointerUp(slider(), { pointerId: 8 });
    expect(onValueCommit).not.toHaveBeenCalled();
    fireEvent.pointerUp(slider(), { pointerId: 7 });
    expect(onValueCommit).toHaveBeenCalledExactlyOnceWith("beta");
  });

  it("commits clickable labels immediately, without duplicate commits for the current stop", () => {
    const { onValueChange, onValueCommit } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Admin only" }));
    expect(onValueChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith("beta");
    expect(onValueCommit).toHaveBeenCalledExactlyOnceWith("beta");
    expect(slider()).toHaveValue("1");
  });

  it.each(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"])(
    "previews native %s changes and commits on key release",
    (key) => {
      const { onValueChange, onValueCommit } = mount();
      fireEvent.keyDown(slider(), { key });
      change(2);
      expect(onValueChange).toHaveBeenCalledExactlyOnceWith("beta");
      expect(onValueCommit).not.toHaveBeenCalled();
      fireEvent.keyUp(slider(), { key });
      expect(onValueCommit).toHaveBeenCalledExactlyOnceWith("beta");
      fireEvent.keyUp(slider(), { key });
      expect(onValueCommit).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps keyboard autorepeat as a single commit and cancels on Escape", () => {
    const { onValueChange, onValueCommit } = mount();
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    change(2);
    fireEvent.keyDown(slider(), { key: "ArrowRight", repeat: true });
    change(3);
    fireEvent.keyDown(slider(), { key: "Escape" });
    fireEvent.keyUp(slider(), { key: "ArrowRight" });
    expect(onValueChange).toHaveBeenLastCalledWith("admin");
    expect(onValueCommit).not.toHaveBeenCalled();
  });

  it("commits a changed keyboard preview if focus leaves before keyup", () => {
    const { onValueCommit } = mount();
    fireEvent.keyDown(slider(), { key: "End" });
    change(3);
    fireEvent.blur(slider());
    expect(onValueCommit).toHaveBeenCalledExactlyOnceWith("ga");
  });

  it("accepts assistive-technology changes without pointer or keyboard events", () => {
    const { onValueChange, onValueCommit } = mount();
    change(0);
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith("off");
    expect(onValueCommit).toHaveBeenCalledExactlyOnceWith("off");
  });

  it("preserves live controlled editor changes but compares commits with the interaction's starting value", () => {
    const onValueCommit = vi.fn();
    function Editor() {
      const [store] = useState(() => createStore(() => ({ value: "admin" })));
      const value = useStore(store, (state) => state.value);
      return (
        <DiscreteSlider
          options={options}
          value={value}
          aria-label="Secretary scope"
          onValueChange={(value) => store.setState({ value })}
          onValueCommit={onValueCommit}
        />
      );
    }
    render(<Editor />);
    begin();
    change(2);
    fireEvent.pointerUp(slider(), { pointerId: 7 });
    expect(onValueCommit).toHaveBeenCalledExactlyOnceWith("beta");
    expect(slider()).toHaveValue("2");
    begin();
    change(3);
    fireEvent.pointerCancel(slider(), { pointerId: 7 });
    expect(slider()).toHaveValue("2");
    expect(onValueCommit).toHaveBeenCalledTimes(1);
  });

  it("reflects saved controlled values and disables every interaction", () => {
    const { rerender, onValueCommit, onValueChange } = mount();
    rerender(
      <DiscreteSlider
        options={options}
        value="ga"
        aria-label="Secretary scope"
        disabled
        onValueChange={onValueChange}
        onValueCommit={onValueCommit}
      />,
    );
    expect(slider()).toHaveValue("3");
    expect(slider()).toBeDisabled();
    for (const button of screen.getAllByRole("button"))
      expect(button).toBeDisabled();
    begin();
    change(2);
    fireEvent.pointerUp(slider(), { pointerId: 7 });
    fireEvent.click(screen.getByRole("button", { name: "Off" }));
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onValueCommit).not.toHaveBeenCalled();
  });

  it("keeps the control safe when options are empty or only one value exists", () => {
    const { rerender } = mount({ options: [], value: "" });
    expect(slider()).toBeDisabled();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(
      <DiscreteSlider
        options={[options[0]]}
        value="off"
        aria-label="Secretary scope"
      />,
    );
    expect(slider()).toBeDisabled();
  });
});

describe("FeatureStageControl", () => {
  it("maps the four Manager stages to translated labels and forwards typed callbacks", () => {
    const onValueCommit = vi.fn();
    render(
      <FeatureStageControl
        value="admin"
        label="Secretary scope"
        onValueCommit={onValueCommit}
      />,
    );
    expect(slider()).toHaveAttribute("aria-valuetext", "Admin only");
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    expect(onValueCommit).toHaveBeenCalledExactlyOnceWith("beta");
  });

  it("uses the translated default label and previews typed editor changes without requiring a commit callback", () => {
    useLocaleStore.setState({ locale: "zh-CN" });
    const onValueChange = vi.fn();
    render(<FeatureStageControl value="admin" onValueChange={onValueChange} />);
    const input = screen.getByRole("slider", { name: "开放阶段" });
    expect(input).toHaveAttribute("aria-valuetext", "仅管理员");
    fireEvent.keyDown(input, { key: "ArrowRight" });
    fireEvent.change(input, { target: { value: "2" } });
    expect(input).toHaveAttribute("aria-valuetext", "试用");
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith("beta");
    fireEvent.keyUp(input, { key: "ArrowRight" });
    expect(input).toHaveAttribute("aria-valuetext", "仅管理员");
  });

  it("allows a read-only controlled view with no callbacks", () => {
    render(<FeatureStageControl value="admin" />);
    const input = screen.getByRole("slider", { name: "Feature stage" });
    fireEvent.click(screen.getByRole("button", { name: "Off" }));
    expect(input).toHaveValue("1");
    fireEvent.keyDown(input, { key: "Home" });
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.keyUp(input, { key: "Home" });
    expect(input).toHaveValue("1");
  });
});
