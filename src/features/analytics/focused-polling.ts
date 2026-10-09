export function hasPageFocus() {
  return (
    document.visibilityState === "visible" &&
    document.hasFocus() &&
    navigator.onLine
  );
}

// Explicit focus gating also covers visible windows that are behind another app.
// TanStack's visibility-only background gate is insufficient for this policy.
export function startFocusedPolling(options: {
  run: () => Promise<unknown>;
  cancel: () => void;
  interval: number;
  nextAt?: number;
  onActive?: (active: boolean) => void;
  onAttempt?: (nextAt: number) => void;
  shouldRetry?: (error: unknown) => boolean;
}) {
  let nextAt = options.nextAt ?? 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false,
    pageHidden = false,
    blurred = !document.hasFocus(),
    running = false,
    errors = 0,
    blocked = false;
  const active = () => !disposed && !pageHidden && !blurred && hasPageFocus();
  const clear = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const schedule = () => {
    clear();
    if (disposed) return;
    options.onActive?.(active());
    if (active() && !running && !blocked)
      timer = setTimeout(tick, Math.max(0, nextAt - Date.now()));
  };
  const tick = async () => {
    if (!active() || running || blocked) return;
    running = true;
    nextAt = Date.now() + options.interval;
    options.onAttempt?.(nextAt);
    try {
      await options.run();
      errors = 0;
      nextAt = Date.now() + options.interval;
    } catch (error) {
      if (active()) {
        blocked = options.shouldRetry?.(error) === false;
        errors += 1;
        nextAt =
          Date.now() +
          Math.min(300_000, options.interval * 2 ** Math.min(errors, 5));
      }
    } finally {
      options.onAttempt?.(nextAt);
      running = false;
      schedule();
    }
  };
  const changed = () => {
    if (!active()) {
      clear();
      options.cancel();
    }
    schedule();
  };
  const blur = () => {
    blurred = true;
    changed();
  };
  const focus = () => {
    blurred = !document.hasFocus();
    changed();
  };
  const hide = () => {
    pageHidden = true;
    changed();
  };
  const show = () => {
    pageHidden = false;
    blurred = !document.hasFocus();
    changed();
  };
  const events = [
    ["blur", blur],
    ["focus", focus],
    ["pagehide", hide],
    ["pageshow", show],
    ["offline", changed],
    ["online", changed],
  ] as const;
  for (const [name, fn] of events) window.addEventListener(name, fn);
  document.addEventListener("visibilitychange", changed);
  schedule();
  return () => {
    disposed = true;
    clear();
    options.cancel();
    for (const [name, fn] of events) window.removeEventListener(name, fn);
    document.removeEventListener("visibilitychange", changed);
  };
}
