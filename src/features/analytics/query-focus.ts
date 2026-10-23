import { focusManager } from "@tanstack/react-query";

// Include OS/window focus so existing shell polls (such as region bootstrap)
// also pause while this visible tab is behind another application.
export function installQueryFocus() {
  focusManager.setEventListener((handleFocus) => {
    const update = () =>
      handleFocus(
        document.visibilityState === "visible" && document.hasFocus(),
      );
    const pause = () => handleFocus(false);
    const events = [
      ["focus", update],
      ["blur", pause],
      ["pagehide", pause],
      ["pageshow", update],
    ] as const;
    for (const [name, fn] of events) window.addEventListener(name, fn);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      for (const [name, fn] of events) window.removeEventListener(name, fn);
      document.removeEventListener("visibilitychange", update);
    };
  });
  return () => {
    focusManager.setEventListener(() => () => {});
    focusManager.setFocused(undefined);
  };
}
