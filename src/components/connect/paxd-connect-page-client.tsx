"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Cpu,
  Globe2,
  Laptop,
  Loader2,
  MapPin,
  Network,
  ShieldCheck,
} from "lucide-react";
import { AuthGate } from "@/features/auth/auth-gate";
import {
  approveNodeRegistration,
  getNodeRegistration,
  toPaxdConnectPreview,
} from "@/features/api/resources";
import { PaxdConnectPreview, User } from "@/features/api/types";
import { Button } from "@/components/ui/button";

const pairCodePattern = /^[A-Z0-9]{6}$/;
const defaultPaxApiEndpoint = "https://api.lakeward.net";

export function resolvePaxdConnectApiEndpoint(
  preview?: Pick<PaxdConnectPreview, "apiEndpoint">,
) {
  return preview?.apiEndpoint ?? defaultPaxApiEndpoint;
}

export function PaxdConnectPageClient() {
  const searchParams = useSearchParams();
  const initialCode = useMemo(
    () => normalizePairCode(searchParams.get("code") ?? ""),
    [searchParams],
  );

  return (
    <AuthGate>
      {(user) => (
        <PaxdConnectShell
          initialCode={initialCode}
          key={initialCode}
          user={user}
        />
      )}
    </AuthGate>
  );
}

function PaxdConnectShell({
  initialCode,
  nodePreview,
  user,
}: {
  initialCode: string;
  nodePreview?: PaxdConnectPreview;
  user: User;
}) {
  const [pairCode, setPairCode] = useState(initialCode);
  const isValidCode = pairCodePattern.test(pairCode);
  const preview = useQuery({
    enabled: isValidCode && !nodePreview,
    queryFn: () =>
      getNodeRegistration(user.user_id, pairCode).then(toPaxdConnectPreview),
    queryKey: ["node-registration", user.user_id, pairCode],
    retry: false,
  });
  const approve = useMutation({
    mutationFn: () => approveNodeRegistration(user.user_id, pairCode),
  });
  const userLabel = user.email ?? user.name ?? user.user_id;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isValidCode && !approve.isPending) {
      approve.mutate();
    }
  }

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto grid min-h-screen w-full max-w-5xl grid-cols-1 content-center gap-10 px-6 py-6 md:grid-cols-[minmax(0,1fr)_360px] md:px-8">
        <section className="min-w-0">
          <header className="border-b border-hairline pb-5">
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-tertiary">
              paxd pairing
            </div>
            <div className="mt-4 text-sm text-ink-tertiary">
              Hello{" "}
              <span className="font-mono italic text-cyan-300">
                {userLabel}
              </span>
              ,
            </div>
            <h1 className="mt-2 text-3xl font-medium leading-[1.14] text-ink md:text-[2.6rem]">
              Connect this node.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-ink-muted">
              Review the device details before approving. PAX Manager will issue
              a node API key to the paxd process waiting in your terminal.
            </p>
          </header>

          <NodePreviewPanel
            preview={nodePreview ?? preview.data}
            previewError={preview.error}
            previewLoading={preview.isFetching}
            user={user}
          />
        </section>

        <aside className="border border-hairline bg-surface-1">
          <div className="border-b border-hairline px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[15px] font-medium">Approve pairing</div>
              <div className="text-[11px] uppercase tracking-[0.08em] text-ink-tertiary">
                {approve.isSuccess ? "approved" : "pending"}
              </div>
            </div>
          </div>

          <form className="grid gap-5 p-5" onSubmit={onSubmit}>
            <div className="grid gap-2.5">
              <label className="grid gap-2.5 text-xs font-medium text-ink-subtle">
                Pair code
                <input
                  autoCapitalize="characters"
                  autoComplete="one-time-code"
                  autoFocus
                  className="h-14 rounded-md border border-hairline bg-surface-2 px-4 text-center font-mono text-2xl font-medium tracking-[0.24em] text-ink outline-none transition placeholder:text-ink-tertiary focus:border-primary"
                  inputMode="text"
                  maxLength={6}
                  onChange={(event) => {
                    setPairCode(normalizePairCode(event.target.value));
                    approve.reset();
                  }}
                  placeholder="ABC123"
                  value={pairCode}
                />
              </label>
              <div className="text-xs leading-5 text-ink-tertiary">
                Use the code shown by the paxd process you started.
              </div>
            </div>

            {approve.error && (
              <div className="border border-warning/30 bg-warning/10 p-3 text-xs leading-5 text-ink-muted">
                {approve.error.message}
              </div>
            )}

            {approve.isSuccess && (
              <div className="border border-success/30 bg-success/10 p-3 text-xs leading-5 text-success">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  paxd approved
                </div>
                <div className="mt-1 font-mono text-[11px] text-ink-muted">
                  registration: {approve.data.registration_id}
                </div>
              </div>
            )}

            <Button
              className="w-full justify-center rounded-md"
              disabled={!isValidCode || approve.isPending || approve.isSuccess}
              icon={
                approve.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )
              }
              type="submit"
              variant="primary"
            >
              {approve.isPending ? "Connecting..." : "Connect paxd"}
            </Button>
          </form>

          <div className="border-t border-hairline px-5 py-4 text-xs leading-5 text-ink-tertiary">
            <div>
              The code expires quickly and is consumed once paxd receives its
              key.
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function NodePreviewPanel({
  preview,
  previewError,
  previewLoading,
  user,
}: {
  preview?: PaxdConnectPreview;
  previewError?: Error | null;
  previewLoading?: boolean;
  user: User;
}) {
  const location = [preview?.city, preview?.country].filter(Boolean).join(", ");
  const previewStatus = preview
    ? "Observed from paxd"
    : previewLoading
      ? "Loading preview"
      : previewError
        ? "Preview unavailable"
        : "Enter pair code";

  return (
    <section className="mt-5">
      <div className="flex items-center justify-between gap-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-[15px] font-medium">
          <Laptop className="h-4 w-4 text-primary-hover" />
          Node identity
        </div>
        <div className="shrink-0 text-[11px] uppercase tracking-[0.08em] text-ink-tertiary">
          {previewStatus}
        </div>
      </div>

      <div className="grid border-t border-l border-hairline sm:grid-cols-2">
        <DetailRow
          icon={<Laptop className="h-4 w-4" />}
          label="Host"
          value={preview?.hostname ?? "Pending manager support"}
        />
        <DetailRow
          icon={<Cpu className="h-4 w-4" />}
          label="Platform"
          value={formatPlatform(preview)}
        />
        <DetailRow
          icon={<Network className="h-4 w-4" />}
          label="Source IP"
          value={preview?.ipAddress ?? "Not captured yet"}
        />
        <DetailRow
          icon={<MapPin className="h-4 w-4" />}
          label="Approx. location"
          value={location || "Not resolved yet"}
        />
        <DetailRow
          icon={<Globe2 className="h-4 w-4" />}
          label="Cloud API"
          value={resolvePaxdConnectApiEndpoint(preview)}
        />
        <DetailRow
          icon={<Clock3 className="h-4 w-4" />}
          label="Requested"
          value={preview?.requestedAt ?? "Within 5 minutes"}
        />
        <DetailRow
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Approving as"
          value={user.email ?? user.user_id}
        />
      </div>
    </section>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 border-r border-b border-hairline px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2 text-[11px] text-ink-tertiary">
        <span className="text-ink-tertiary">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 truncate font-mono text-[12px] text-ink-muted">
        {value}
      </div>
    </div>
  );
}

function formatPlatform(preview?: PaxdConnectPreview) {
  if (!preview) {
    return "Pending manager support";
  }

  return [preview.os, preview.arch, preview.machineType, preview.paxdVersion]
    .filter(Boolean)
    .join(" / ");
}

function normalizePairCode(value: string) {
  return value
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 6);
}
