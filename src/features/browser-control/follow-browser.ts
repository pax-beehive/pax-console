import type { BrowserState } from "./api";

// Native audit is newest-first. Viewer polling is not agent activity.
export function followBrowser(state: BrowserState | undefined, previous = "") {
  if (!state) return "";
  const connected = (id?: string | null) =>
    Boolean(id && state.workers.some((worker) => worker.session === id));
  if (connected(state.operator)) return state.operator!;
  const recent = state.audit.find(
    (entry) =>
      (entry.event === "tool.started" || entry.event === "tool.finished") &&
      connected(entry.session),
  );
  if (recent?.session) return recent.session;
  if (connected(previous)) return previous;
  return state.workers.length === 1 ? state.workers[0].session : "";
}
