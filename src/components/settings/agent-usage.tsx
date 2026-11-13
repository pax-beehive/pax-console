"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { TruncatedText } from "@/components/ui/text";
import { useNodeHarnessUsage } from "@/features/api/resources";
import type {
  HarnessUsageAmountItem,
  HarnessUsageItem,
  HarnessUsagePercentItem,
  HarnessUsageView,
  LoginHarness,
} from "@/features/api/types";
import { compactDateTime, formatAge } from "@/lib/format";
import { cn } from "@/lib/utils";
import { agentTypeLabel } from "./agent-types";

const currencyUnits = new Set(["usd", "eur", "cny"]);
const countUnits = new Set(["credits", "tokens", "requests"]);

/** Value text for an amount item, such as "12.40 / 50.00 USD" or "300 tokens". */
export function formatUsageAmount(
  item: Pick<HarnessUsageAmountItem, "used" | "limit" | "unit">,
) {
  const unit = item.unit?.toLowerCase();
  const currency = unit !== undefined && currencyUnits.has(unit);
  const format = (value: number) =>
    currency
      ? value.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : Math.round(value).toLocaleString("en-US");
  const amount =
    item.limit !== undefined
      ? `${format(item.used)} / ${format(item.limit)}`
      : format(item.used);
  if (currency) return `${amount} ${unit!.toUpperCase()}`;
  if (unit && countUnits.has(unit)) return `${amount} ${unit}`;
  return amount;
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

function usableItems(view: HarnessUsageView): HarnessUsageItem[] {
  return (view.items ?? []).filter((item) => {
    if (!item?.id || !item.label) return false;
    switch (item.kind) {
      case "percent":
        return Number.isFinite(item.used_percent);
      case "amount":
        return (
          Number.isFinite(item.used) &&
          (item.limit === undefined || Number.isFinite(item.limit))
        );
      case "status":
        return Boolean(item.value);
      default:
        // Newer devices may report kinds this console does not know yet.
        return false;
    }
  });
}

function unavailableMessage(label: string, errorCode?: string) {
  switch (errorCode) {
    case "cli_unsupported":
      return `Update ${label} on this device to see plan usage.`;
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
  className,
  hideWhenUnsupported = false,
  refreshKey = 0,
}: {
  userId: string;
  nodeId: string;
  harness: LoginHarness;
  className?: string;
  /** Hide entirely when the agent type reports no plan usage at all. */
  hideWhenUnsupported?: boolean;
  /** Changing this value re-reads usage, e.g. from the account card Refresh. */
  refreshKey?: number;
}) {
  const usage = useNodeHarnessUsage(userId, nodeId, harness);
  const now = useClock(30_000);
  const view = usage.data?.harness_usage;
  const current = view?.harness === harness ? view : undefined;
  const updated = current && updatedLabel(current.observed_at, now);
  const { refetch } = usage;
  const lastRefresh = useRef(refreshKey);
  useEffect(() => {
    if (lastRefresh.current === refreshKey) return;
    lastRefresh.current = refreshKey;
    void refetch();
  }, [refreshKey, refetch]);
  if (hideWhenUnsupported && current?.state === "unsupported") return null;

  return (
    <section
      aria-label="Plan usage"
      className={cn("grid min-w-0 gap-2", className)}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3">
        <h2 className="text-sm font-medium text-ink">Plan usage</h2>
        {usage.isFetching && current ? (
          <span className="text-xs text-ink-tertiary">Updating…</span>
        ) : (
          updated && (
            <span className="text-xs text-ink-tertiary">{updated}</span>
          )
        )}
      </div>
      {current ? (
        <>
          <UsageDetails view={current} now={now} />
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

function UsageDetails({ view, now }: { view: HarnessUsageView; now: number }) {
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
        {unavailableMessage(
          view.harness_label?.trim() || agentTypeLabel(view.harness),
          view.error_code,
        )}
      </p>
    );
  }
  const items = usableItems(view);
  if (items.length === 0) {
    return (
      <p className="text-sm leading-6 text-ink-muted">
        No plan usage reported yet.
      </p>
    );
  }
  // One row per item; subgrid keeps the bars and numbers aligned across rows.
  return (
    <ul className="grid min-w-0 max-w-2xl grid-cols-[minmax(0,max-content)_minmax(2.5rem,1fr)_auto_auto] items-center gap-x-3 gap-y-1">
      {items.map((item) => (
        <UsageItemRow key={item.id} item={item} now={now} />
      ))}
    </ul>
  );
}

function barColor(item: HarnessUsageItem, percent: number) {
  const severity =
    item.severity ??
    (percent >= 100 ? "critical" : percent >= 80 ? "warning" : "normal");
  return severity === "critical"
    ? "bg-danger"
    : severity === "warning"
      ? "bg-warning"
      : "bg-primary";
}

function UsageMeter({
  item,
  percent,
  valueText,
}: {
  item: HarnessUsageItem;
  percent: number;
  valueText: string;
}) {
  return (
    <div
      role="meter"
      aria-label={item.label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={valueText}
      className="h-1 w-full overflow-hidden rounded-full bg-surface-3"
    >
      <div
        className={cn("h-full rounded-full", barColor(item, percent))}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function ResetCountdown({ resetsAt, now }: { resetsAt?: string; now: number }) {
  const countdown = formatResetCountdown(resetsAt, now);
  if (!countdown) return <span aria-hidden="true" />;
  return (
    <time
      dateTime={resetsAt}
      title={compactDateTime(resetsAt)}
      className="whitespace-nowrap text-xs text-ink-tertiary"
    >
      {/* Narrow screens show only the countdown; screen readers keep the prefix. */}
      <span className="sr-only sm:not-sr-only">
        {countdown === "soon" ? "resets " : "resets in "}
      </span>
      {countdown}
    </time>
  );
}

const clampPercent = (value: number) =>
  Math.min(100, Math.max(0, Math.round(value)));

function UsageItemRow({ item, now }: { item: HarnessUsageItem; now: number }) {
  const label = (
    <TruncatedText className="max-w-40 text-ink">{item.label}</TruncatedText>
  );
  const rowClass =
    "col-span-4 grid grid-cols-subgrid items-center text-sm leading-6";

  if (item.kind === "status") {
    return (
      <li className={rowClass}>
        {label}
        <span className="col-span-3 min-w-0 text-ink-muted">{item.value}</span>
      </li>
    );
  }
  if (item.kind === "percent") {
    return (
      <PercentRow item={item} label={label} now={now} rowClass={rowClass} />
    );
  }
  const text = formatUsageAmount(item);
  const limited = item.limit !== undefined && item.limit > 0;
  const percent = limited ? clampPercent((item.used / item.limit!) * 100) : 0;
  return (
    <li className={rowClass}>
      {label}
      {limited ? (
        <UsageMeter item={item} percent={percent} valueText={text} />
      ) : (
        <span aria-hidden="true" />
      )}
      <span className="whitespace-nowrap text-right tabular-nums text-ink-muted">
        {text}
      </span>
      <ResetCountdown resetsAt={item.resets_at} now={now} />
    </li>
  );
}

function PercentRow({
  item,
  label,
  now,
  rowClass,
}: {
  item: HarnessUsagePercentItem;
  label: ReactNode;
  now: number;
  rowClass: string;
}) {
  const percent = clampPercent(item.used_percent);
  return (
    <li className={rowClass}>
      {label}
      <UsageMeter
        item={item}
        percent={percent}
        valueText={`${percent}% used`}
      />
      <span className="whitespace-nowrap text-right tabular-nums text-ink-muted">
        {percent}% used
      </span>
      <ResetCountdown resetsAt={item.resets_at} now={now} />
    </li>
  );
}
