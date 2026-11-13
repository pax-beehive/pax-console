"use client";
import { useI18n } from "@/features/i18n/use-i18n";

import { useEffect, useRef, useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PendingPairing } from "@/features/e2ee/device-key-store";
import { codeGeneration } from "@/features/e2ee/short-code-policy";
import { ShortCodeCrypto } from "@/features/e2ee/short-code-worker-client";
import {
  approveShortCode,
  cancelShortPairing,
  matchShortCode,
  rejectShortCode,
  serveShortPairing,
  type ShortCodeGrant,
} from "@/features/e2ee/short-code-runtime";

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
function message(error: unknown) {
  return error instanceof Error ? error.message : null;
}

type ErrorNotice = { message: string | null };
type ApprovalNotice = ErrorNotice | "authorized" | "declined";

export function SecretValue({
  label,
  value,
  large = false,
}: {
  label: string;
  value: string;
  large?: boolean;
}) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-tertiary">
        <span>{label}</span>
        <div className="flex gap-1">
          <Button
            size="sm"
            aria-label={visible ? t("Hide code") : t("Show code")}
            icon={
              visible ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )
            }
            onClick={() => setVisible((v) => !v)}
          />
          <Button
            size="sm"
            icon={<Copy className="h-4 w-4" />}
            onClick={() => {
              void navigator.clipboard
                .writeText(value)
                .then(() => {
                  setCopied(true);
                  setCopyFailed(false);
                })
                .catch(() => setCopyFailed(true));
            }}
          >
            {copied ? t("Copied") : t("Copy")}
          </Button>
        </div>
      </div>
      <pre
        className={`min-w-0 whitespace-pre-wrap break-all rounded-md border border-hairline bg-canvas p-3 font-mono ${large ? "text-center text-3xl tracking-widest" : "text-xs leading-5"}`}
      >
        {visible
          ? large
            ? value.replace(/(.{4})/, "$1 ")
            : value
          : large
            ? "•••• ••••"
            : "••••••••••••••••"}
      </pre>
      {copyFailed && (
        <p role="status" className="text-xs text-ink-muted">
          {t("Could not copy. Reveal the code to enter it manually.")}
        </p>
      )}
    </div>
  );
}

// Mounted by pairing ID: reload resumes the persisted request, while switching
// agent/request terminates all work and discards the old display immediately.
export function ShortCodeRecipient({
  userId,
  pending,
  onEnded,
}: {
  userId: string;
  pending: PendingPairing;
  onEnded: () => void;
}) {
  const { t } = useI18n();
  const now = useNow();
  const [code, setCode] = useState<{ generation: number; value: string }>();
  const [error, setError] = useState<ErrorNotice>();
  const [busy, setBusy] = useState(false);
  const worker = useRef<ShortCodeCrypto | null>(null);
  const [initial] = useState(pending);
  const local = initial.shortCode;
  const start = Date.parse(local?.serverCreatedAt ?? "");
  const serverNow = now + (local?.clockOffsetMs ?? 0);
  const generation = Number.isFinite(start)
    ? codeGeneration(start, Math.max(start, serverNow))
    : -1;
  const expired =
    serverNow >= Date.parse(initial.expiresAt ?? "") || generation > 9;
  useEffect(() => {
    const cryptoWorker = new ShortCodeCrypto();
    worker.current = cryptoWorker;
    const controller = new AbortController();
    void serveShortPairing(
      userId,
      initial,
      cryptoWorker,
      controller.signal,
    ).catch((error) => {
      if (!controller.signal.aborted) setError({ message: message(error) });
    });
    return () => {
      controller.abort();
      cryptoWorker.close();
      worker.current = null;
    };
  }, [userId, initial]);
  useEffect(() => {
    if (!worker.current || !local || generation < 0 || generation > 9) return;
    let active = true;
    void worker.current
      .call("deriveShortCode", local.seed, initial.pairingId, generation)
      .then((value) => {
        if (active) setCode({ generation, value });
      })
      .catch((error) => {
        if (active) setError({ message: message(error) });
      });
    return () => {
      active = false;
    };
  }, [generation, initial.pairingId, local]);
  return (
    <div className="grid min-w-0 gap-3">
      <h2 className="text-sm font-medium">
        {t("Authorize from another device")}
      </h2>
      <p className="text-sm text-ink-muted">
        {t(
          "On an authorized device, open Encryption access for this agent and enter this code.",
        )}
      </p>
      {!expired && code?.generation === generation ? (
        <SecretValue label={t("Your code")} value={code.value} large />
      ) : (
        <p className="text-sm">
          {expired
            ? t("Code expired. Create a new request.")
            : t("Preparing code…")}
        </p>
      )}
      {!expired && (
        <p className="text-center text-xs text-ink-tertiary">
          {t("New code in {seconds}s · Waiting for access…", {
            seconds: Math.max(
              1,
              Math.ceil((start + (generation + 1) * 60_000 - serverNow) / 1000),
            ),
          })}
        </p>
      )}
      {error && (
        <p role="status" className="break-words text-sm text-ink-muted">
          {error.message ?? t("Please try again.")}
        </p>
      )}
      <Button
        disabled={busy || expired}
        onClick={() => {
          setBusy(true);
          void cancelShortPairing(userId, initial)
            .then(onEnded)
            .catch((error) => setError({ message: message(error) }))
            .finally(() => setBusy(false));
        }}
      >
        {t("Cancel request")}
      </Button>
    </div>
  );
}

export function ShortCodeApprover({
  userId,
  agentId,
}: {
  userId: string;
  agentId: string;
}) {
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const [visible, setVisible] = useState(false);
  const [grant, setGrant] = useState<ShortCodeGrant>();
  const [status, setStatus] = useState<ApprovalNotice>();
  const [matching, setMatching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const mounted = useRef(true);
  const now = useNow();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!/^\d{8}$/.test(input)) return;
    const controller = new AbortController();
    let worker: ShortCodeCrypto | undefined;
    const timer = setTimeout(() => {
      worker = new ShortCodeCrypto();
      setMatching(true);
      setStatus(undefined);
      void matchShortCode(userId, agentId, input, worker, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) setGrant(value);
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setStatus({ message: message(error) });
        })
        .finally(() => {
          worker?.close();
          if (!controller.signal.aborted) setMatching(false);
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
      worker?.close();
    };
  }, [userId, agentId, input, retry]);
  const expired = !!grant && now >= grant.deadline;
  async function decide(approve: boolean) {
    if (!grant || busy || Date.now() >= grant.deadline) return;
    setBusy(true);
    try {
      if (approve) await approveShortCode(userId, grant);
      else await rejectShortCode(userId, grant);
      if (mounted.current) {
        setGrant(undefined);
        setInput("");
        setStatus(approve ? "authorized" : "declined");
      }
    } catch (error) {
      if (mounted.current) setStatus({ message: message(error) });
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section className="grid min-w-0 gap-3">
      <h2 className="text-sm font-medium">{t("Authorize another device")}</h2>
      <label htmlFor="short-pairing-code" className="text-xs text-ink-tertiary">
        {t("Code from the new device")}
      </label>
      <div className="flex min-w-0 gap-2">
        <input
          id="short-pairing-code"
          autoComplete="off"
          inputMode="numeric"
          maxLength={11}
          disabled={busy}
          type={visible ? "text" : "password"}
          className="h-11 w-full min-w-0 flex-1 rounded-md border border-hairline bg-canvas px-3 font-mono text-xl tracking-widest text-ink"
          value={input}
          onChange={(event) => {
            setInput(
              event.target.value
                .replace(/[\s-]/g, "")
                .replace(/[^0-9]/g, "")
                .slice(0, 8),
            );
            setGrant(undefined);
            setStatus(undefined);
            setMatching(false);
          }}
        />
        <Button
          aria-label={visible ? t("Hide code") : t("Show code")}
          icon={
            visible ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )
          }
          onClick={() => setVisible((v) => !v)}
        />
      </div>
      {matching && (
        <p role="status" className="text-sm text-ink-muted">
          {t("Matching device…")}
        </p>
      )}
      {grant && (
        <div className="grid min-w-0 gap-3 rounded-md border border-hairline p-3">
          <p className="break-words text-sm font-medium">
            {grant.request.device_name || t("New device")}
          </p>
          <p className="text-xs text-ink-tertiary">
            {expired
              ? t("Confirmation expired. Enter the current code again.")
              : t("Confirm within {seconds}s", {
                  seconds: Math.ceil((grant.deadline - now) / 1000),
                })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={busy || expired}
              onClick={() => void decide(true)}
            >
              {t("Authorize device")}
            </Button>
            <Button
              disabled={busy || expired}
              onClick={() => void decide(false)}
            >
              {t("Decline")}
            </Button>
          </div>
        </div>
      )}
      {status && (
        <p role="status" className="break-words text-sm text-ink-muted">
          {status === "authorized"
            ? t("Device authorized.")
            : status === "declined"
              ? t("Request declined.")
              : (status.message ?? t("Please try again."))}
        </p>
      )}
      {!matching && !busy && /^\d{8}$/.test(input) && (!grant || expired) && (
        <Button
          onClick={() => {
            setGrant(undefined);
            setRetry((v) => v + 1);
          }}
        >
          {t("Try again")}
        </Button>
      )}
    </section>
  );
}
