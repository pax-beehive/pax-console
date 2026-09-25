export type SessionSidePanelId = "tool" | "artifacts" | "browser" | "knowledge";

export function canSeeSessionSidePanel(
  panelId: SessionSidePanelId,
  showAdminFeatures: boolean,
) {
  return panelId !== "knowledge" || showAdminFeatures;
}
