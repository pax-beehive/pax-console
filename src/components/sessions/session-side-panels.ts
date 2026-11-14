export type SessionSidePanelId =
  | "tool"
  | "artifacts"
  | "browser"
  | "mobile"
  | "knowledge";

export function canSeeSessionSidePanel(
  panelId: SessionSidePanelId,
  knowledgeCapsulesEnabled: boolean,
) {
  return panelId !== "knowledge" || knowledgeCapsulesEnabled;
}
