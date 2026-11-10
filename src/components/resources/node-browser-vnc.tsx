"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { VNCChannel } from "@/features/browser-control/vnc-channel";
import { usePreviewFocus } from "@/features/browser-control/use-preview-focus";
import { DockerBrowserPreview } from "./docker-browser-preview";
import { VNCTextInput } from "./vnc-text-input";
import { sendVNCText } from "@/features/browser-control/vnc-text-input";

const modifiers = [
  [0xffe1, "ShiftLeft"],
  [0xffe2, "ShiftRight"],
  [0xffe3, "ControlLeft"],
  [0xffe4, "ControlRight"],
  [0xffe9, "AltLeft"],
  [0xffea, "AltRight"],
  [0xffeb, "MetaLeft"],
  [0xffec, "MetaRight"],
  [0xff7e, "AltLeft"], // macOS Option can arrive as Mode_switch.
  [0xfe03, "AltRight"], // ISO_Level3_Shift / AltGr.
] as const;

type KeyboardViewer = {
  sendKey(keysym: number, code?: string | null, down?: boolean): void;
};

function releaseModifiers(viewer: KeyboardViewer) {
  for (const [keysym, code] of modifiers) viewer.sendKey(keysym, code, false);
}

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
  const viewerRef = useRef<KeyboardViewer | null>(null);
  const channelRef = useRef<VNCChannel | null>(null);
  const readyRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Connecting...");
  useEffect(() => {
    let disposed = false;
    const channel = new VNCChannel(userId, nodeId);
    channelRef.current = channel;
    let rfb: { disconnect(): void } | undefined;
    void import("@novnc/novnc/lib/rfb")
      .then(({ default: RFB }) => {
        if (disposed || !host.current) return;
        const viewer = new RFB(host.current, channel);
        rfb = viewer;
        viewerRef.current = viewer;
        viewer.scaleViewport = true;
        viewer.resizeSession = false;
        viewer.qualityLevel = 5;
        viewer.compressionLevel = 6;
        viewer.addEventListener("connect", () => {
          if (!disposed) {
            // An interrupted viewer can leave modifiers down remotely. Release
            // them once on takeover; lock keys must never be toggled blindly.
            releaseModifiers(viewer);
            readyRef.current = true;
            setReady(true);
            setStatus(
              "Connected; click the desktop for shortcuts, or use the text field below",
            );
          }
        });
        viewer.addEventListener("disconnect", () => {
          readyRef.current = false;
          if (!disposed) {
            setReady(false);
            setStatus(
              `Disconnected. ${channel.failure ?? "No transport error was captured; the viewer or remote endpoint closed the connection."} Reconnect to continue; input was not replayed.`,
            );
          }
        });
        void channel.connect();
      })
      .catch(() => {
        readyRef.current = false;
        if (!disposed) {
          setReady(false);
          setStatus("Desktop viewer failed to load");
        }
        channel.close();
      });
    return () => {
      disposed = true;
      readyRef.current = false;
      viewerRef.current = null;
      channelRef.current = null;
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
      {ready && (
        <VNCTextInput
          sendText={async (text) => {
            const viewer = viewerRef.current;
            const channel = channelRef.current;
            if (!viewer || !readyRef.current || channel?.readyState !== 1)
              throw Error("Remote desktop is disconnected");
            await sendVNCText(text, (value) => channel.sendText(value));
            if (!readyRef.current || channel.readyState !== 1)
              throw Error("Text delivery was interrupted");
          }}
        />
      )}
    </>
  );
}
