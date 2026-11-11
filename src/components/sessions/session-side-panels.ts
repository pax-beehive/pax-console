export type SessionSidePanelId =
  | "tool"
  | "artifacts"
  | "browser"
  | "mobile"
  | "knowledge";

export function canSeeSessionSidePanel(
  panelId: SessionSidePanelId,
  showAdminFeatures: boolean,
) {
  return panelId !== "knowledge" || showAdminFeatures;
}
