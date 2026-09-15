"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { VNCChannel } from "@/features/browser-control/vnc-channel";
import { usePreviewFocus } from "@/features/browser-control/use-preview-focus";
import { DockerBrowserPreview } from "./docker-browser-preview";

export function NodeBrowserVNC({
  userId,
  nodeId,
}: {
  userId: string;
  nodeId: string;
}) {
  const [connected, setConnected] = useState(false);
  usePreviewFocus(() => setConnected(false));
  return (
    <section className="grid min-w-0 gap-2 border-t border-hairline pt-3">
      <h3>Docker desktop</h3>
      <p className="text-xs text-ink-tertiary">
        Watch the Docker desktop in preview. Take control to use the mouse and
        keyboard. Leaving this page returns to preview.
      </p>
      <Button onClick={() => setConnected(!connected)}>
        {connected ? "Release control" : "Take control"}
      </Button>
      {connected ? (
        <Desktop key={`${userId}/${nodeId}`} userId={userId} nodeId={nodeId} />
      ) : (
        <DockerBrowserPreview userId={userId} nodeId={nodeId} />
      )}
    </section>
  );
}
function Desktop({ userId, nodeId }: { userId: string; nodeId: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Connecting...");
  useEffect(() => {
    let disposed = false;
    const channel = new VNCChannel(userId, nodeId);
    let rfb: { disconnect(): void } | undefined;
    void import("@novnc/novnc/lib/rfb")
      .then(({ default: RFB }) => {
        if (disposed || !host.current) return;
        const viewer = new RFB(host.current, channel);
        rfb = viewer;
        viewer.scaleViewport = true;
        viewer.resizeSession = false;
        viewer.qualityLevel = 5;
        viewer.compressionLevel = 6;
        viewer.addEventListener("connect", () => {
          if (!disposed) setStatus("Connected; click the desktop to type");
        });
        viewer.addEventListener("disconnect", () => {
          if (!disposed)
            setStatus(
              `Disconnected. ${channel.failure ?? "No transport error was captured; the viewer or remote endpoint closed the connection."} Reconnect to continue; input was not replayed.`,
            );
        });
        void channel.connect();
      })
      .catch(() => {
        if (!disposed) setStatus("Desktop viewer failed to load");
        channel.close();
      });
    return () => {
      disposed = true;
      rfb?.disconnect();
      channel.close();
    };
  }, [userId, nodeId]);
  return (
    <>
      <p className="text-xs text-ink-tertiary" role="status">
        {status}
      </p>
      <div
        ref={host}
        className="aspect-video w-full overflow-hidden bg-black"
      />
    </>
  );
}
