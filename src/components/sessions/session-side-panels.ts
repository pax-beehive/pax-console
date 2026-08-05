export type SessionSidePanelId = "tool" | "artifacts" | "knowledge";

export function canSeeSessionSidePanel(
  panelId: SessionSidePanelId,
  showAdminFeatures: boolean,
) {
  return panelId !== "knowledge" || showAdminFeatures;
}
