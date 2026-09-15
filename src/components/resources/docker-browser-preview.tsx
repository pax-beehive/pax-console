"use client";

import { useEffect, useState } from "react";
import {
  browserControl,
  type BrowserFrame,
} from "@/features/browser-control/api";
import { InlineError } from "@/components/ui/inline-error";
import { BrowserPreviewImage } from "./browser-preview-image";

export function DockerBrowserPreview({
  userId,
  nodeId,
}: {
  userId: string;
  nodeId: string;
}) {
  const [frame, setFrame] = useState<BrowserFrame>();
  const [error, setError] = useState<Error>();
  const [invalid, setInvalid] = useState<string>();
  useEffect(() => {
    let stopped = false;
    let pending = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      if (stopped || pending || document.visibilityState === "hidden") return;
      pending = true;
      let success = false;
      try {
        const next = await browserControl<BrowserFrame>(
          userId,
          nodeId,
          "view",
          { source: "docker", action: { type: "screenshot" } },
        );
        if (!stopped) {
          setFrame(next);
          setError(undefined);
        }
        success = true;
      } catch (e) {
        if (!stopped)
          setError(e instanceof Error ? e : new Error("Preview unavailable"));
      } finally {
        pending = false;
        if (!stopped) timer = setTimeout(refresh, success ? 2000 : 5000);
      }
    }
    function visibilityChanged() {
      clearTimeout(timer);
      if (document.visibilityState !== "hidden") void refresh();
    }
    document.addEventListener("visibilitychange", visibilityChanged);
    void refresh();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [userId, nodeId]);
  return (
    <div className="grid gap-2">
      <p role="status" className="text-xs text-ink-tertiary">
        {error || (frame && frame.frame === invalid)
          ? "Preview interrupted. Retrying automatically…"
          : frame
            ? "Preview · updates automatically"
            : "Connecting to preview…"}
      </p>
      {error && <InlineError error={error} />}
      {frame && frame.frame !== invalid && (
        <div className="relative overflow-hidden border border-hairline">
          <BrowserPreviewImage
            frame={frame}
            onError={() => setInvalid(frame.frame)}
          />
        </div>
      )}
    </div>
  );
}
