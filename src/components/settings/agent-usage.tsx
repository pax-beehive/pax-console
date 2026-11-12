"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TruncatedText } from "@/components/ui/text";
import { useNodeHarnessUsage } from "@/features/api/resources";
import type {
  HarnessUsageView,
  HarnessUsageWindow,
  LoginHarness,
} from "@/features/api/types";
import { compactDateTime, formatAge } from "@/lib/format";
import { cn } from "@/lib/utils";

const harnessNames: Record<LoginHarness, string> = {
  claude: "Claude Code",
  codex: "Codex",
};

type WindowShape = Pick<HarnessUsageWindow, "window_minutes" | "scope">;

function windowLength(minutes: number) {
  if (!Number.isInteger(minutes) || minutes <= 0) return undefined;
  if (minutes === 10080) return "Weekly";
  if (minutes % 1440 === 0) return `${minutes / 1440}-day`;
  if (minutes % 60 === 0 && minutes < 1440) return `${minutes / 60}-hour`;
  return `${minutes}-minute`;
}

function withScope(label: string, scope?: string) {
  const trimmed = scope?.trim();
  return trimmed ? `${label} · ${trimmed}` : label;
}

/** Accessible window name, such as "5-hour limit" or "Weekly limit · Fable". */
export function usageWindowLabel(window: WindowShape) {
  const length = windowLength(window.window_minutes);
  return withScope(length ? `${length} limit` : "Usage limit", window.scope);
}

/** Row label, such as "5-hour" or "Weekly · Fable". */
export function usageWindowShortLabel(window: WindowShape) {
  return withScope(
    windowLength(window.window_minutes) ?? "Usage",
    window.scope,
  );
}

/** Compact time until a window resets, such as "3h 20m", or "soon". */
export function formatResetCountdown(
  resetsAt: string | undefined,
  now: number = Date.now(),
) {
  const time = resetsAt ? Date.parse(resetsAt) : Number.NaN;
  if (!Number.isFinite(time)) return undefined;
  const minutes = Math.ceil((time - now) / 60_000);
  if (minutes <= 1) return "soon";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return `${hours}h${rest ? ` ${rest}m` : ""}`;
  }
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return `${days}d${rest ? ` ${rest}h` : ""}`;
}

function updatedLabel(observedAt: string | undefined, now: number) {
  const time = observedAt ? Date.parse(observedAt) : Number.NaN;
  if (!Number.isFinite(time)) return undefined;
  if (now - time < 60_000) return "Updated just now";
  return `Updated ${formatAge(observedAt, now)} ago`;
}

function usableWindows(view: HarnessUsageView) {
  return (view.windows ?? []).filter(
    (window) =>
      Number.isFinite(window.used_percent) &&
      Number.isFinite(window.window_minutes) &&
      window.window_minutes > 0,
  );
}

function unavailableMessage(harness: LoginHarness, errorCode?: string) {
  switch (errorCode) {
    case "cli_unsupported":
      return `Update ${harnessNames[harness]} on this device to see plan usage.`;
    case "daemon_unsupported":
      return "Update PAX on this device to see plan usage.";
    default:
      return "Plan usage is unavailable right now.";
  }
}

/** Re-render relative times while the page stays open. */
function useClock(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/**
 * Plan usage for the harness credentials on one device. Mount it only after
 * sign-in credentials are detected; it never changes the sign-in state.
 */
export function HarnessUsagePanel({
  userId,
  nodeId,
  harness,
}: {
  userId: string;
  nodeId: string;
  harness: LoginHarness;
}) {
  const usage = useNodeHarnessUsage(userId, nodeId, harness);
  const now = useClock(30_000);
  const view = usage.data?.harness_usage;
  const current = view?.harness === harness ? view : undefined;
  const extra =
    current?.state === "available" && current.extra_usage
      ? `Extra usage ${current.extra_usage.enabled ? "on" : "off"}`
      : undefined;
  const meta = [extra, current && updatedLabel(current.observed_at, now)]
    .filter(Boolean)
    .join(" · ");

  return (
    <section aria-label="Plan usage" className="grid min-w-0 gap-1.5">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3">
        <h2 className="text-sm font-medium text-ink">Plan usage</h2>
        <div className="flex min-w-0 items-center gap-1 text-xs text-ink-tertiary">
          {meta && <span>{meta}</span>}
          {/* Keeps a 44px touch target without making the heading row taller. */}
          <Button
            size="icon"
            variant="ghost"
            className="-my-3 h-11 w-11"
            aria-label="Refresh plan usage"
            tooltip="Refresh plan usage"
            icon={
              <RefreshCw
                aria-hidden="true"
                className={cn(
                  "h-3.5 w-3.5",
                  usage.isFetching && "animate-spin",
                )}
              />
            }
            disabled={usage.isFetching}
            onClick={() => void usage.refetch()}
          />
        </div>
      </div>
      {current ? (
        <>
          <UsageDetails view={current} harness={harness} now={now} />
          {usage.error && !usage.isFetching && (
            <p role="alert" className="text-sm leading-6 text-warning">
              Plan usage could not be refreshed.
            </p>
          )}
        </>
      ) : usage.error ? (
        <p role="alert" className="text-sm leading-6 text-warning">
          Plan usage could not be loaded.
        </p>
      ) : usage.isPending || usage.isFetching ? (
        <p role="status" className="text-sm leading-6 text-ink-tertiary">
          Checking plan usage…
        </p>
      ) : (
        <p className="text-sm leading-6 text-ink-muted">
          Plan usage is unavailable right now.
        </p>
      )}
    </section>
  );
}

function UsageDetails({
  view,
  harness,
  now,
}: {
  view: HarnessUsageView;
  harness: LoginHarness;
  now: number;
}) {
  if (view.state === "unsupported") {
    return (
      <p className="text-sm leading-6 text-ink-muted">
        This sign-in method does not report plan usage.
      </p>
    );
  }
  if (view.state !== "available") {
    return (
      <p className="text-sm leading-6 text-ink-muted">
        {unavailableMessage(harness, view.error_code)}
      </p>
    );
  }
  const windows = usableWindows(view);
  if (windows.length === 0) {
    return (
      <p className="text-sm leading-6 text-ink-muted">
        No plan usage reported yet.
      </p>
    );
  }
  // One row per window; subgrid keeps the bars and numbers aligned across rows.
  return (
    <ul className="grid min-w-0 grid-cols-[minmax(0,max-content)_minmax(2.5rem,1fr)_auto_auto] items-center gap-x-3 gap-y-1">
      {windows.map((window) => (
        <UsageWindowRow key={window.id} window={window} now={now} />
      ))}
    </ul>
  );
}

function UsageWindowRow({
  window,
  now,
}: {
  window: HarnessUsageWindow;
  now: number;
}) {
  const label = usageWindowLabel(window);
  const percent = Math.min(100, Math.max(0, Math.round(window.used_percent)));
  const countdown = formatResetCountdown(window.resets_at, now);

  return (
    <li className="col-span-4 grid grid-cols-subgrid items-center text-sm leading-6">
      <TruncatedText className="max-w-40 text-ink">
        {usageWindowShortLabel(window)}
      </TruncatedText>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent}% used`}
        className="h-1 w-full overflow-hidden rounded-full bg-surface-3"
      >
        <div
          className={cn(
            "h-full rounded-full",
            percent >= 100
              ? "bg-danger"
              : percent >= 80
                ? "bg-warning"
                : "bg-primary",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="whitespace-nowrap text-right tabular-nums text-ink-muted">
        {percent}% used
      </span>
      {countdown ? (
        <time
          dateTime={window.resets_at}
          title={compactDateTime(window.resets_at)}
          className="whitespace-nowrap text-xs text-ink-tertiary"
        >
          {/* Narrow screens show only the countdown; screen readers keep the prefix. */}
          <span className="sr-only sm:not-sr-only">
            {countdown === "soon" ? "resets " : "resets in "}
          </span>
          {countdown}
        </time>
      ) : (
        <span aria-hidden="true" />
      )}
    </li>
  );
}
