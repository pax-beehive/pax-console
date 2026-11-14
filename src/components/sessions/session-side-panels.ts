export type SessionSidePanelId =
  | "tool"
  | "artifacts"
  | "browser"
  | "mobile"
  | "knowledge";

/** Which in-development features are enabled for the account. */
export type SessionSidePanelFeatures = {
  androidControl: boolean;
  browserControl: boolean;
  knowledgeCapsules: boolean;
};

/** A panel that belongs to a feature is listed only while it is enabled. */
export function canSeeSessionSidePanel(
  panelId: SessionSidePanelId,
  features: SessionSidePanelFeatures,
) {
  if (panelId === "knowledge") return features.knowledgeCapsules;
  if (panelId === "browser") return features.browserControl;
  if (panelId === "mobile") return features.androidControl;
  return true;
}
