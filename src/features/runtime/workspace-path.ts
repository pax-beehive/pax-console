export function isSupportedSessionWorkspace(workspace: string) {
  const value = workspace.trim();
  return value.startsWith("/") || value === "~" || value.startsWith("~/");
}
