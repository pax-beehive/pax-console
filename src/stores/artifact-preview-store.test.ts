import { afterEach, describe, expect, it } from "vitest";
import { useArtifactPreviewStore } from "./artifact-preview-store";

afterEach(() => useArtifactPreviewStore.setState({ activeByScope: {} }));

describe("artifact preview selection", () => {
  it("selects one viewer per scope without affecting another session", () => {
    const { activate } = useArtifactPreviewStore.getState();
    activate("session-1", "first");
    activate("session-2", "other");
    activate("session-1", "second");
    expect(useArtifactPreviewStore.getState().activeByScope).toEqual({
      "session-1": "second",
      "session-2": "other",
    });
  });

  it("does not clear the new selection when a previously active viewer unmounts", () => {
    const { activate, release } = useArtifactPreviewStore.getState();
    activate("session", "first");
    activate("session", "second");
    release("session", "first");
    expect(useArtifactPreviewStore.getState().activeByScope.session).toBe(
      "second",
    );
    release("session", "second");
    expect(useArtifactPreviewStore.getState().activeByScope).toEqual({});
  });
});
