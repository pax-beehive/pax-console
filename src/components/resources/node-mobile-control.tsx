"use client";

import { useI18n } from "@/features/i18n/use-i18n";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Circle,
  Download,
  Home,
  Square,
  Smartphone,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/inline-error";
import { MonoId } from "@/components/ui/text";
import {
  mobileControl,
  readMobileRecording,
  type MobileFrame,
  type MobileOperation,
  type MobileRecording,
} from "@/features/mobile-control/api";
import {
  mobileStateKey,
  useMobilePanelActive,
  useMobileState,
} from "@/features/mobile-control/use-mobile-state";

const inputClass =
  "min-h-9 min-w-0 rounded-md border border-hairline bg-surface-1 px-2 text-sm text-ink disabled:opacity-50";

export function NodeMobileControl({
  nodeId,
  userId,
}: {
  nodeId: string;
  userId: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <section
      aria-label={t("Android control")}
      className="grid min-w-0 gap-3 border-t border-hairline pt-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-medium">{t("Android")}</h2>
        <Button
          icon={<Smartphone className="h-4 w-4" />}
          onClick={() => setOpen(!open)}
        >
          {open ? t("Close Android panel") : t("Open Android control")}
        </Button>
      </div>
      {open && (
        <NodeMobileViewer
          key={`${userId}/${nodeId}`}
          nodeId={nodeId}
          userId={userId}
        />
      )}
    </section>
  );
}

export function NodeMobileViewer({
  nodeId,
  userId,
  onPrepare,
  prepareDisabled = false,
}: {
  nodeId: string;
  userId: string;
  // True means instructions were added to the chat draft, not sent.
  onPrepare?: () => Promise<boolean>;
  prepareDisabled?: boolean;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [controlSession, setControlSession] = useState("");
  const [consumedFrame, setConsumedFrame] = useState("");
  const [operationBusy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [preparing, setPreparing] = useState(false);
  const preparingRef = useRef(false);
  const [preparationDraftAdded, setPreparationDraftAdded] = useState(false);
  const [preparationError, setPreparationError] = useState<Error>();
  const busy = operationBusy || preparing;
  const selectionVersion = useRef(0);
  const [image, setImage] = useState<{
    sessionId: string;
    frame: MobileFrame;
    receivedAt: number;
  }>();
  const [previewError, setPreviewError] = useState<Error>();
  const frameAbort = useRef<AbortController | null>(null);
  const operationAbort = useRef<AbortController | null>(null);
  const [error, setError] = useState<Error>();
  const [text, setText] = useState("");
  const [recordKind, setRecordKind] = useState<"screen" | "audio">("screen");
  const [duration, setDuration] = useState(30);
  const [file, setFile] = useState<{ id: string; url: string; mime: string }>();
  const [fileProgress, setFileProgress] = useState<number>();
  const downloadAbort = useRef<AbortController | null>(null);
  const pointer = useRef<{
    x: number;
    y: number;
    at: number;
    frameId: string;
  } | null>(null);
  const active = useMobilePanelActive(() => {
    selectionVersion.current++;
    setControlSession("");
    setImage(undefined);
    frameAbort.current?.abort();
    operationAbort.current?.abort();
    pointer.current = null;
    downloadAbort.current?.abort();
  });
  const query = useMobileState(userId, nodeId, active);
  const state = query.data;
  // Selection is explicit. A removed/stopped device never switches to another phone.
  const session = state?.sessions.find((value) => value.id === selectedId);
  const running = session?.state === "running";
  // Screenshots stay only in this surface's ephemeral state, outside query caches.
  const refreshFrame = useCallback(async () => {
    if (!active || !running || busyRef.current || frameAbort.current) return;
    const version = selectionVersion.current;
    const controller = new AbortController();
    frameAbort.current = controller;
    try {
      const next = await mobileControl<MobileFrame>(
        userId,
        nodeId,
        "screenshot",
        { sessionId: selectedId },
        controller.signal,
      );
      if (!controller.signal.aborted && version === selectionVersion.current) {
        setImage({
          sessionId: selectedId,
          frame: next,
          receivedAt: Date.now(),
        });
        setPreviewError(undefined);
      }
    } catch (cause) {
      if (!controller.signal.aborted && version === selectionVersion.current)
        setPreviewError(
          cause instanceof Error
            ? cause
            : new Error(t("Screenshot unavailable.")),
        );
    } finally {
      if (frameAbort.current === controller) frameAbort.current = null;
    }
  }, [active, running, userId, nodeId, selectedId, t]);
  useEffect(() => {
    if (!active || !running || busy) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      await refreshFrame();
      if (!stopped) timer = setTimeout(poll, 2000);
    }
    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      frameAbort.current?.abort();
    };
  }, [active, running, busy, refreshFrame]);
  const recordings = useQuery({
    queryKey: [...mobileStateKey(userId, nodeId), "recordings", selectedId],
    queryFn: ({ signal }) =>
      mobileControl<MobileRecording[]>(
        userId,
        nodeId,
        "recording_list",
        { sessionId: selectedId },
        signal,
      ),
    enabled: active && Boolean(session) && !busy,
    retry: false,
    refetchInterval: active && !busy ? 5000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    gcTime: 0,
  });
  const captured =
    running && active && image?.sessionId === selectedId ? image : undefined;
  const frame = captured?.frame;
  const controlling =
    active && session?.takeover === true && controlSession === selectedId;
  const canInput =
    controlling && !busy && frame && consumedFrame !== frame.frameId;

  useEffect(
    () => () => {
      selectionVersion.current++;
      downloadAbort.current?.abort();
      operationAbort.current?.abort();
      frameAbort.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!file) return;
    return () => URL.revokeObjectURL(file.url);
  }, [file]);

  function chooseDevice(id: string) {
    selectionVersion.current++;
    frameAbort.current?.abort();
    setImage(undefined);
    setPreviewError(undefined);
    downloadAbort.current?.abort();
    setSelectedId(id);
    setControlSession("");
    setText("");
    setFile(undefined);
    setFileProgress(undefined);
    setError(undefined);
    pointer.current = null;
  }

  async function refresh() {
    await queryClient.invalidateQueries({
      queryKey: mobileStateKey(userId, nodeId),
    });
    await refreshFrame();
  }

  async function addPreparationInstructions() {
    if (
      !onPrepare ||
      prepareDisabled ||
      preparingRef.current ||
      busyRef.current ||
      !active
    )
      return;
    preparingRef.current = true;
    setPreparing(true);
    setPreparationDraftAdded(false);
    setPreparationError(undefined);
    try {
      if (await onPrepare()) setPreparationDraftAdded(true);
      else
        setPreparationError(
          new Error(
            t(
              "Preparation instructions were not added. Check the session, then try again.",
            ),
          ),
        );
    } catch {
      setPreparationError(
        new Error(
          t(
            "Could not add preparation instructions to chat. Check the session, then try again.",
          ),
        ),
      );
    } finally {
      preparingRef.current = false;
      setPreparing(false);
    }
  }

  async function run(
    operation: MobileOperation,
    args: Record<string, unknown> = {},
  ) {
    if (busyRef.current || preparingRef.current || !active) return;
    const id = selectedId;
    const version = selectionVersion.current;
    if (!session) return;
    busyRef.current = true;
    const controller = new AbortController();
    operationAbort.current = controller;
    setBusy(true);
    setError(undefined);
    pointer.current = null;
    // Every operation may invalidate the server's last input reference.
    if (frame) setConsumedFrame(frame.frameId);
    try {
      await mobileControl(
        userId,
        nodeId,
        operation,
        { sessionId: id, ...args },
        controller.signal,
      );
      if (operation === "takeover" && version === selectionVersion.current)
        setControlSession(id);
      if (operation === "release") setControlSession("");
    } catch (cause) {
      setError(
        controller.signal.aborted
          ? new Error(
              t(
                "Request ended without a confirmed result. Refresh state before trying again.",
              ),
            )
          : cause instanceof Error
            ? cause
            : new Error(
                t(
                  "Android operation failed. Refresh state before trying again.",
                ),
              ),
      );
    } finally {
      if (operationAbort.current === controller) operationAbort.current = null;
      busyRef.current = false;
      setBusy(false);
      if (version === selectionVersion.current) await refresh();
      else
        await queryClient.invalidateQueries({
          queryKey: mobileStateKey(userId, nodeId),
        });
    }
  }

  function input(
    operation: "tap" | "swipe" | "text" | "key",
    args: Record<string, unknown>,
    expectedFrame?: string,
  ) {
    if (
      !canInput ||
      !frame ||
      !captured ||
      (expectedFrame && expectedFrame !== frame.frameId)
    )
      return;
    if (Date.now() - captured.receivedAt > 9000) {
      setConsumedFrame(frame.frameId);
      setError(
        new Error(
          t("Screenshot expired. Refresh before controlling the phone."),
        ),
      );
      void refreshFrame();
      return;
    }
    void run(operation, { ...args, frameId: frame.frameId });
  }

  function point(event: PointerEvent<HTMLImageElement>) {
    if (!frame) return null;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    return {
      x: Math.max(
        0,
        Math.min(
          frame.width - 1,
          Math.floor(
            ((event.clientX - bounds.left) * frame.width) / bounds.width,
          ),
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          frame.height - 1,
          Math.floor(
            ((event.clientY - bounds.top) * frame.height) / bounds.height,
          ),
        ),
      ),
    };
  }

  function startPointer(event: PointerEvent<HTMLImageElement>) {
    if (!canInput || !frame || event.button !== 0) return;
    const position = point(event);
    if (!position) return;
    pointer.current = { ...position, at: Date.now(), frameId: frame.frameId };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function endPointer(event: PointerEvent<HTMLImageElement>) {
    const start = pointer.current;
    pointer.current = null;
    const end = point(event);
    if (!start || !end) return;
    if (Math.hypot(end.x - start.x, end.y - start.y) < 12)
      input("tap", end, start.frameId);
    else
      input(
        "swipe",
        {
          x1: start.x,
          y1: start.y,
          x2: end.x,
          y2: end.y,
          durationMs: Math.max(50, Math.min(5000, Date.now() - start.at)),
        },
        start.frameId,
      );
  }

  async function loadRecording(record: MobileRecording, download: boolean) {
    if (downloadAbort.current || !session || !active) return;
    const abort = new AbortController();
    downloadAbort.current = abort;
    setError(undefined);
    setFileProgress(0);
    try {
      const result = await readMobileRecording(
        userId,
        nodeId,
        session.id,
        record.id,
        {
          signal: abort.signal,
          progress: (received, total) =>
            setFileProgress(Math.round((received / total) * 100)),
        },
      );
      abort.signal.throwIfAborted();
      const url = URL.createObjectURL(result.blob);
      if (download) {
        const link = document.createElement("a");
        link.href = url;
        link.download = `${record.id}.${record.kind === "audio" ? "opus" : "mkv"}`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else setFile({ id: record.id, url, mime: result.mime });
    } catch (cause) {
      if (!abort.signal.aborted)
        setError(
          cause instanceof Error
            ? cause
            : new Error(t("Recording unavailable.")),
        );
    } finally {
      if (downloadAbort.current === abort) {
        downloadAbort.current = null;
        setFileProgress(undefined);
      }
    }
  }

  return (
    <div className="grid min-w-0 gap-3">
      <p className="text-xs text-ink-tertiary">
        {t(
          "Android emulator on this device. Screenshot preview; audio is available in completed recordings.",
        )}
      </p>
      {onPrepare ? (
        <div className="grid gap-2">
          <Button
            size="sm"
            disabled={prepareDisabled || busy || !active}
            onClick={() => void addPreparationInstructions()}
          >
            {preparing
              ? t("Adding preparation instructions…")
              : t("Add preparation instructions to chat")}
          </Button>
          <p className="text-xs text-ink-tertiary">
            {t(
              "Add the setup instructions to the chat input. Review and send them to let the agent prepare the phone, then follow progress in chat.",
            )}
          </p>
          {preparationDraftAdded && (
            <p className="text-xs text-ink-muted" role="status">
              {t(
                "Preparation instructions added to the chat input. Review them, then send when ready.",
              )}
            </p>
          )}
          {preparationError && <InlineError error={preparationError} />}
        </div>
      ) : (
        <p className="text-xs text-ink-tertiary">
          {t("Ask the agent in a session to prepare the phone using the")}{" "}
          <a
            className="underline underline-offset-2"
            href="https://github.com/CCGV2/agent-mobile-runtime/blob/main/docs/agent-preparation.md"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("Android setup guide")}
          </a>
          .
        </p>
      )}
      {(error || query.error) && <InlineError error={error ?? query.error!} />}
      {query.isPending && (
        <p className="text-sm text-ink-tertiary">
          {t("Checking Android runtime…")}
        </p>
      )}
      {state && !state.available && (
        <p className="text-sm text-ink-muted">
          {t(
            "Android runtime is not ready on this device. Ask the agent to prepare it, then refresh to check its progress.",
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy || !active}
          onClick={() => void refresh()}
        >
          {t("Refresh")}
        </Button>
      </div>
      {state?.available && (
        <>
          <label className="grid gap-1 text-xs text-ink-tertiary">
            {t("Phone")}{" "}
            <select
              aria-label={t("Android phone")}
              className={inputClass}
              value={selectedId}
              disabled={busy}
              onChange={(event) => chooseDevice(event.target.value)}
            >
              <option value="">{t("Choose a phone")}</option>
              {state.sessions.map((value) => (
                <option key={value.id} value={value.id}>
                  {value.template} · {value.id.slice(0, 8)} · {t(value.state)}
                </option>
              ))}
            </select>
          </label>
          {!state.sessions.length && (
            <p className="text-sm text-ink-tertiary">
              {t(
                "No phones yet. Ask the agent to read the setup guide and prepare one for this session.",
              )}
            </p>
          )}
          {selectedId && !session && (
            <p className="text-sm text-warning">
              {t(
                "This phone is no longer available. Choose a phone explicitly.",
              )}
            </p>
          )}
        </>
      )}
      {session && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-tertiary">
            <MonoId>{session.id}</MonoId>
            <Badge>{t(session.state)}</Badge>
            {session.takeover && <Badge>{t("Human control")}</Badge>}
          </div>
          {session.recoveryRequired && (
            <p className="text-xs text-warning">
              {t(
                "Ask the agent to inspect the recovery state on the device host before preparing it again.",
              )}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy || !running || controlling || !active}
              onClick={() => void run("takeover")}
            >
              {t("Take control")}
            </Button>
            <Button
              size="sm"
              disabled={busy || !session.takeover || !active}
              onClick={() => void run("release")}
            >
              {t("Release control")}
            </Button>
          </div>
          <p className="text-xs text-ink-tertiary">
            {t(
              "Take control before tapping or typing. The agent stays paused until you release control. Each input uses one fresh screenshot.",
            )}
          </p>
          {!active && (
            <p className="text-xs text-ink-tertiary">
              {t("Preview paused while this window is inactive.")}
            </p>
          )}
          {previewError && active && <InlineError error={previewError} />}
          <div className="flex min-h-40 justify-center overflow-hidden rounded-md border border-hairline bg-canvas p-2">
            {frame ? (
              // Captured pixels remain local to this surface, outside image optimization.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={t("Android phone screenshot")}
                src={`data:image/png;base64,${frame.data}`}
                width={frame.width}
                height={frame.height}
                draggable={false}
                className="h-auto max-h-[55dvh] max-w-full object-contain"
                style={{
                  touchAction: controlling ? "none" : "auto",
                  cursor: canInput ? "crosshair" : "default",
                }}
                onPointerDown={startPointer}
                onPointerUp={endPointer}
                onPointerCancel={() => {
                  pointer.current = null;
                }}
              />
            ) : (
              <p className="self-center text-xs text-ink-tertiary">
                {running
                  ? t("Waiting for a fresh screenshot…")
                  : t(
                      "The agent needs to start this phone before its screen is available.",
                    )}
              </p>
            )}
          </div>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label={t("Android navigation")}
          >
            <Button
              size="sm"
              disabled={!canInput}
              icon={<ArrowLeft className="h-3.5 w-3.5" />}
              onClick={() => input("key", { key: "BACK" })}
            >
              {t("Back")}
            </Button>
            <Button
              size="sm"
              disabled={!canInput}
              icon={<Home className="h-3.5 w-3.5" />}
              onClick={() => input("key", { key: "HOME" })}
            >
              {t("Home")}
            </Button>
            <Button
              size="sm"
              disabled={!canInput}
              icon={<Square className="h-3.5 w-3.5" />}
              onClick={() => input("key", { key: "APP_SWITCH" })}
            >
              {t("Apps")}
            </Button>
          </div>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (
                !canInput ||
                !text ||
                !/^[\x20-\x7e]+$/.test(text) ||
                text.includes("%s")
              )
                return;
              const value = text;
              setText("");
              input("text", { text: value });
            }}
          >
            <input
              className={`${inputClass} flex-1`}
              aria-label={t("Text for Android phone")}
              placeholder={t("Printable ASCII text")}
              maxLength={2000}
              value={text}
              disabled={!controlling || busy}
              autoComplete="off"
              onChange={(event) => setText(event.target.value)}
            />
            <Button
              type="submit"
              size="sm"
              disabled={
                !canInput ||
                !text ||
                !/^[\x20-\x7e]+$/.test(text) ||
                text.includes("%s")
              }
            >
              {t("Send text")}
            </Button>
          </form>
          <div className="grid gap-2 border-t border-hairline pt-3">
            <h3 className="text-sm font-medium">{t("Recordings")}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className={inputClass}
                aria-label={t("Android recording type")}
                value={recordKind}
                disabled={busy}
                onChange={(event) =>
                  setRecordKind(event.target.value as "screen" | "audio")
                }
              >
                <option value="screen">{t("Screen + internal audio")}</option>
                <option value="audio">{t("Internal audio")}</option>
              </select>
              <label className="flex items-center gap-1 text-xs text-ink-tertiary">
                <input
                  className={`${inputClass} w-16`}
                  aria-label={t("Recording duration in seconds")}
                  type="number"
                  min={1}
                  max={300}
                  value={duration}
                  disabled={busy}
                  onChange={(event) => setDuration(Number(event.target.value))}
                />{" "}
                {t("seconds")}
              </label>
              <Button
                size="sm"
                icon={<Circle className="h-3.5 w-3.5" />}
                disabled={
                  busy ||
                  !running ||
                  !active ||
                  !Number.isInteger(duration) ||
                  duration < 1 ||
                  duration > 300
                }
                onClick={() =>
                  void run("recording_start", {
                    kind: recordKind,
                    durationSec: duration,
                  })
                }
              >
                {t("Start recording")}
              </Button>
            </div>
            {recordings.error && <InlineError error={recordings.error} />}
            {recordings.data?.length === 0 && (
              <p className="text-xs text-ink-tertiary">
                {t("No recordings for this phone.")}
              </p>
            )}
            {recordings.data?.map((record) => (
              <article
                key={record.id}
                aria-label={t("Android recording {value1}", {
                  value1: record.id,
                })}
                className="grid gap-2 border-t border-hairline py-2"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                  <span>
                    {record.kind === "audio"
                      ? t("Internal audio")
                      : t("Screen + audio")}
                  </span>
                  <span>{t(record.state)}</span>
                  <MonoId>{record.id}</MonoId>
                  <span>
                    {Math.ceil(record.bytes / 1024)} {t("KiB")}
                  </span>
                </div>
                {record.error && (
                  <p className="text-xs text-warning">{record.error}</p>
                )}
                {["starting", "recording"].includes(record.state) && (
                  <Button
                    size="sm"
                    disabled={busy || !active}
                    onClick={() =>
                      void run("recording_stop", { recordingId: record.id })
                    }
                  >
                    {t("Stop recording")}
                  </Button>
                )}
                {record.state === "completed" && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      icon={<Download className="h-3.5 w-3.5" />}
                      disabled={busy || fileProgress !== undefined || !active}
                      onClick={() => void loadRecording(record, true)}
                    >
                      {t("Download")}{" "}
                      {record.kind === "audio" ? t("audio") : t("MKV")}
                    </Button>
                    {record.kind === "audio" && (
                      <Button
                        size="sm"
                        disabled={busy || fileProgress !== undefined || !active}
                        onClick={() => void loadRecording(record, false)}
                      >
                        {t("Load audio")}
                      </Button>
                    )}
                  </div>
                )}
                {file?.id === record.id && file.mime === "audio/ogg" && (
                  <audio
                    controls
                    preload="metadata"
                    src={file.url}
                    aria-label={t("Recorded Android internal audio")}
                  />
                )}
              </article>
            ))}
            {fileProgress !== undefined && (
              <p className="text-xs text-ink-tertiary" role="status">
                {t("Loading recording:")} {fileProgress}%
              </p>
            )}
            <p className="text-xs text-ink-tertiary">
              {t(
                "Only completed files can be loaded. MKV downloads may need an external player. Runtime credentials remain on the device.",
              )}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
