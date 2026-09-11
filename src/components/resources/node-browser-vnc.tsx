"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { VNCChannel } from "@/features/browser-control/vnc-channel";

export function NodeBrowserVNC({
  userId,
  nodeId,
}: {
  userId: string;
  nodeId: string;
}) {
  const [connected, setConnected] = useState(false);
  return (
    <section className="grid min-w-0 gap-2 border-t border-hairline pt-3">
      <h3>Docker desktop</h3>
      <p className="text-xs text-ink-tertiary">
        Shows the shared Docker desktop, including all browser windows. Mouse
        and keyboard input are enabled. Disconnect closes the viewer only.
      </p>
      <Button onClick={() => setConnected(!connected)}>
        {connected ? "Disconnect desktop" : "Connect Docker desktop"}
      </Button>
      {connected && (
        <Desktop key={`${userId}/${nodeId}`} userId={userId} nodeId={nodeId} />
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
              "Disconnected. Reconnect to continue; input was not replayed.",
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
        className="h-[60vh] min-h-64 w-full overflow-hidden bg-black"
      />
    </>
  );
}
