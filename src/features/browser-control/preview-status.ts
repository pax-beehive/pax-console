// Older runtimes return strings rather than typed viewer status codes.
// Match only known transient read failures; input failures stay actionable.
export function previewWaitingMessage(error: Error | undefined) {
  switch (error?.message) {
    case "Viewer operation timed out; inspect before retrying":
    case "Browser was busy; waiting for the next live image":
    case "Browser worker is busy":
    case "Viewer is busy":
      return "Browser is busy. Waiting for the next live image…";
    case "Browser image unavailable or page changed; waiting for the next live image":
      return "Waiting for the browser’s next live image…";
    case "VIEWER_TAB_CLOSED":
      return "Browser window is closed. Waiting for new browser activity…";
    case "Browser worker is not connected":
      return "Waiting for the browser to reconnect…";
    default:
      return undefined;
  }
}
