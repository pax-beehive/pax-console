"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/inline-error";
import { MAX_VNC_TEXT_LENGTH } from "@/features/browser-control/vnc-text-input";

export function VNCTextInput({
  sendText,
}: {
  sendText: (text: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const draftRef = useRef("");
  const [composing, setComposing] = useState(false);
  const composingRef = useRef(false);
  const [error, setError] = useState<Error>();
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const mountedRef = useRef(true);
  const tooLong = Array.from(draft).length > MAX_VNC_TEXT_LENGTH;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      draftRef.current = "";
    };
  }, []);

  async function send() {
    if (
      sendingRef.current ||
      composingRef.current ||
      !draftRef.current ||
      Array.from(draftRef.current).length > MAX_VNC_TEXT_LENGTH
    )
      return;
    const text = draftRef.current;
    // Consume before sending: a partial or ambiguous delivery is not reusable.
    draftRef.current = "";
    sendingRef.current = true;
    setDraft("");
    setSending(true);
    setError(undefined);
    try {
      await sendText(text);
    } catch (cause) {
      const unsupported =
        cause instanceof Error &&
        /unsupported|not supported|update.*(?:paxd|runtime)/i.test(
          cause.message,
        );
      if (mountedRef.current)
        setError(
          new Error(
            unsupported
              ? "Remote text input is not supported by this node. Update paxd and the Docker browser runtime, then reconnect. Text was not replayed."
              : "Text delivery was interrupted. Inspect the remote field before sending again; text was not replayed.",
          ),
        );
    } finally {
      sendingRef.current = false;
      if (mountedRef.current) setSending(false);
    }
  }

  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-xs text-ink-muted">
        Text for remote desktop
        <textarea
          className="min-h-20 w-full resize-y rounded-md border border-hairline bg-surface-1 px-3 py-2 text-base text-ink outline-none focus:border-accent"
          value={draft}
          disabled={sending}
          autoComplete="off"
          spellCheck={false}
          rows={2}
          onChange={(event) => {
            draftRef.current = event.currentTarget.value;
            setDraft(event.currentTarget.value);
          }}
          onCompositionStart={() => {
            composingRef.current = true;
            setComposing(true);
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
            setComposing(false);
          }}
        />
      </label>
      <p className="text-xs text-ink-tertiary">
        Click the remote field first. Use your local input method here for
        Chinese, mixed case and symbols, then paste the text into the selected
        remote field. Up to 2,000 characters; line breaks and tabs remain text.
      </p>
      <Button
        type="button"
        className="justify-self-start"
        disabled={sending || composing || !draft || tooLong}
        aria-busy={sending}
        onClick={() => void send()}
      >
        {sending ? "Sending…" : "Send text"}
      </Button>
      {tooLong && (
        <InlineError
          error={
            new Error(
              "Text exceeds 2,000 characters. Shorten it before sending.",
            )
          }
        />
      )}
      {error && <InlineError error={error} />}
    </div>
  );
}
