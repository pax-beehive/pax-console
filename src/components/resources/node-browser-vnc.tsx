"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { VNCChannel } from "@/features/browser-control/vnc-channel";
import { usePreviewFocus } from "@/features/browser-control/use-preview-focus";
import { DockerBrowserPreview } from "./docker-browser-preview";
import { VNCTextInput } from "./vnc-text-input";
import { sendVNCText } from "@/features/browser-control/vnc-text-input";
import { ExternalLink } from "lucide-react";

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
  layout = "embedded",
}: {
  userId: string;
  nodeId: string;
  layout?: "embedded" | "page";
}) {
  const [connected, setConnected] = useState(false);
  usePreviewFocus(() => setConnected(false));
  return (
    <section
      className={
        layout === "page"
          ? "flex h-full min-h-0 min-w-0 flex-col gap-2"
          : "grid min-w-0 gap-2 border-t border-hairline pt-3"
      }
    >
      {layout === "embedded" && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <h3>Docker desktop</h3>
          <Button asChild size="sm" icon={<ExternalLink className="h-4 w-4" />}>
            <a
              href={`/nodes/${encodeURIComponent(nodeId)}/browser`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setConnected(false)}
            >
              Open in new page
            </a>
          </Button>
        </div>
      )}
      <p className="shrink-0 text-xs text-ink-tertiary">
        {layout === "page"
          ? "Preview until you take control. Leaving this page releases control."
          : "Watch the Docker desktop in preview. Take control to use the mouse and keyboard. Leaving this page returns to preview."}
      </p>
      <Button
        className="shrink-0 self-start"
        onClick={() => setConnected(!connected)}
      >
        {connected ? "Release control" : "Take control"}
      </Button>
      <div
        className={
          layout === "page" ? "min-h-0 flex-1 overflow-hidden" : undefined
        }
      >
        {connected ? (
          <Desktop
            key={`${userId}/${nodeId}`}
            userId={userId}
            nodeId={nodeId}
            layout={layout}
          />
        ) : (
          <div
            className={
              layout === "page"
                ? "h-full overflow-auto overscroll-contain"
                : undefined
            }
          >
            <DockerBrowserPreview userId={userId} nodeId={nodeId} />
          </div>
        )}
      </div>
    </section>
  );
}
function Desktop({
  userId,
  nodeId,
  layout,
}: {
  userId: string;
  nodeId: string;
  layout: "embedded" | "page";
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<KeyboardViewer | null>(null);
  const channelRef = useRef<VNCChannel | null>(null);
  const readyRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Connecting...");
  useEffect(() => {
    let disposed = false;
    const channel = new VNCChannel(userId, nodeId);
    const desktop = host.current;
    // Canvas wheel events are handled by noVNC. Contain unhandled events on
    // the frame/letterbox so they cannot scroll the surrounding chat or page.
    const containWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    desktop?.addEventListener("wheel", containWheel, { passive: false });
    channelRef.current = channel;
    let rfb: { disconnect(): void } | undefined;
    void import("@novnc/novnc/lib/rfb")
      .then(({ default: RFB }) => {
        if (disposed || !host.current) return;
        const viewer = new RFB(host.current, channel);
        rfb = viewer;
        viewerRef.current = viewer;
        viewer.scaleViewport = true;
        viewer.clipViewport = true;
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
      desktop?.removeEventListener("wheel", containWheel);
      rfb?.disconnect();
      channel.close();
    };
  }, [userId, nodeId]);
  return (
    <div
      className={
        layout === "page"
          ? "flex h-full min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain"
          : "grid gap-2"
      }
    >
      <p className="shrink-0 text-xs text-ink-tertiary" role="status">
        {status}
      </p>
      <div
        ref={host}
        role="region"
        aria-label="Remote Docker desktop"
        className={
          layout === "page"
            ? "min-h-24 min-w-0 flex-1 touch-none overflow-hidden overscroll-contain bg-black"
            : "aspect-video w-full touch-none overflow-hidden overscroll-contain bg-black"
        }
      />
      <p className="shrink-0 text-xs text-ink-tertiary">
        Desktop shortcuts use Ctrl. On touch screens, drag with two fingers to
        scroll.
      </p>
      {ready && (
        <details open={layout === "embedded"} className="shrink-0">
          <summary className="cursor-pointer py-2 text-sm text-ink-muted">
            Type text with your keyboard
          </summary>
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
        </details>
      )}
    </div>
  );
}
