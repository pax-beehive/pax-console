"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { AuthGate } from "@/features/auth/auth-gate";
import { canSeeAdminFeatures } from "@/features/auth/admin-view";
import { AuthError } from "@/features/api/errors";
import type { User } from "@/features/api/types";
import { useConsoleStore } from "@/stores/console-store";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchBox } from "@/components/ui/search-box";
import { MonoId } from "@/components/ui/text";
import {
  subscriptionStates,
  subscriptionSummary,
  type PushReceiver,
  type SubscriptionFilters,
  type RegionalSubscriptions,
} from "@/features/analytics/subscription-data";
import { useSubscriptions } from "@/features/analytics/use-subscriptions";
import { AdminAnalyticsNav } from "./admin-analytics-nav";

const date = (value?: string) =>
  value ? new Date(value).toLocaleString() : "Unknown";
const regionName = (region: string) =>
  ({ us: "United States", hk: "Hong Kong", local: "Local" })[region] ?? region;
const selectClass =
  "min-h-9 rounded-md border border-hairline bg-surface-1 px-2 text-sm text-ink";

export function SubscriptionDashboardPage() {
  return (
    <AuthGate>
      {(user) => (
        <ConsoleLayout user={user}>
          <SubscriptionDashboardAccess user={user} />
        </ConsoleLayout>
      )}
    </AuthGate>
  );
}

export function SubscriptionDashboardAccess({ user }: { user: User }) {
  const preview = useConsoleStore((state) => state.previewAsUser);
  if (!canSeeAdminFeatures(user, preview))
    return (
      <p className="p-6 text-sm text-ink-muted">
        Push subscriptions are available to administrators.
      </p>
    );
  return <SubscriptionDashboard userId={user.user_id} />;
}

export function SubscriptionDashboard({ userId }: { userId: string }) {
  const params = useSearchParams();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [region, setRegion] = useState(params.get("region") ?? "all");
  const [customer, setCustomer] = useState(params.get("user_id") ?? "");
  const [pages, setPages] = useState<Record<string, string[]>>({});
  const [appliedSearch, setAppliedSearch] = useState("");
  const filters: SubscriptionFilters = {
    search: appliedSearch,
    status,
    channel,
    region,
    userId: customer,
    cursors: Object.fromEntries(
      Object.entries(pages).map(([region, stack]) => [
        region,
        stack.at(-1) ?? "",
      ]),
    ),
  };
  const change = (set: (value: string) => void, value: string) => {
    set(value);
    setPages({});
  };
  const move = (region: string, cursor?: string) =>
    setPages((old) => ({
      ...old,
      [region]: cursor
        ? [...(old[region] ?? []), cursor]
        : (old[region] ?? []).slice(0, -1),
    }));
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto grid max-w-7xl gap-5">
        <AdminAnalyticsNav />
        <header>
          <h1 className="text-xl font-semibold text-ink">Push subscriptions</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Device registrations and notification outcomes across customers.
          </p>
        </header>
        <form
          className="flex flex-wrap items-center gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            change(setAppliedSearch, search.trim());
          }}
        >
          <SearchBox
            aria-label="Search subscriptions"
            placeholder="Customer, device, or receiver ID"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="min-w-48 flex-1"
          />
          <Button type="submit">Search</Button>
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            Region
            <select
              className={selectClass}
              aria-label="Region"
              value={region}
              onChange={(event) => change(setRegion, event.target.value)}
            >
              <option value="all">All regions</option>
              <option value="us">United States</option>
              <option value="hk">Hong Kong</option>
              {region === "local" && <option value="local">Local</option>}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            Status
            <select
              className={selectClass}
              aria-label="Subscription status"
              value={status}
              onChange={(event) => change(setStatus, event.target.value)}
            >
              <option value="">All statuses</option>
              {subscriptionStates.map((value) => (
                <option key={value} value={value}>
                  {value[0].toUpperCase() + value.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            Channel
            <select
              className={selectClass}
              aria-label="Channel"
              value={channel}
              onChange={(event) => change(setChannel, event.target.value)}
            >
              <option value="">All channels</option>
              <option value="web_push">Web Push</option>
            </select>
          </label>
          {customer && (
            <span className="flex min-w-0 items-center gap-2 text-xs text-ink-muted">
              <span>Customer</span>
              <MonoId>{customer}</MonoId>
              <Button type="button" onClick={() => change(setCustomer, "")}>
                Clear customer filter
              </Button>
            </span>
          )}
        </form>
        <SubscriptionResults
          key={JSON.stringify(filters)}
          userId={userId}
          filters={filters}
          pages={pages}
          move={move}
        />
        <p className="text-xs leading-5 text-ink-tertiary">
          Enabled means registered in Pax. Device permission is the last client
          report, not a live OS check. Provider accepted does not confirm
          display or reading. Dates use your local timezone.
        </p>
      </div>
    </div>
  );
}

export function SubscriptionResults({
  userId,
  filters,
  pages,
  move,
}: {
  userId: string;
  filters: SubscriptionFilters;
  pages: Record<string, string[]>;
  move: (region: string, cursor?: string) => void;
}) {
  const query = useSubscriptions(userId, filters);
  const [selected, setSelected] = useState<{
    receiverId: string;
    region: string;
  } | null>(null);
  const denied = query.error instanceof AuthError;
  const sources = denied
    ? []
    : (query.data?.regions ?? []).filter(
        (source) =>
          filters.region === "all" || source.region === filters.region,
      );
  const summary = subscriptionSummary(sources);
  const selectedReceiver = selected
    ? sources
        .find((source) => source.region === selected.region)
        ?.receivers?.find(
          (receiver) => receiver.receiver_id === selected.receiverId,
        )
    : undefined;
  const metrics = [
    ["Registered", summary.total],
    ["Enabled", summary.total === null ? null : summary.enabled],
    ["Disabled", summary.total === null ? null : summary.disabled],
    [
      "Expired / invalidated",
      summary.total === null ? null : summary.expired + summary.invalidated,
    ],
    ["Revoked", summary.total === null ? null : summary.revoked],
    [
      "Accounts with enabled devices",
      summary.total === null ? null : summary.enabled_users,
    ],
  ] as const;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge
          tone={denied ? "danger" : summary.partial ? "warning" : "neutral"}
        >
          {denied
            ? "Access denied"
            : !query.focused
              ? "Paused · not focused"
              : query.isError
                ? "Retrying with backoff"
                : "Live · 15s"}
        </Badge>
        <Button
          type="button"
          disabled={denied || query.isFetching || !query.focused}
          onClick={() => {
            void query.refetch();
          }}
        >
          Refresh
        </Button>
      </div>
      {query.isError && (
        <p role="alert" className="text-sm text-danger">
          {denied
            ? "Administrator access is required. Previously loaded data is hidden."
            : "Unable to refresh subscriptions. Previous snapshots remain visible and may be stale."}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {metrics.map(([label, value]) => (
          <div
            key={label}
            className="rounded-md border border-hairline bg-surface-1 p-3"
          >
            <p className="text-xs text-ink-muted">{label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
              {value ?? "—"}
            </p>
            <p className="mt-1 text-xs text-ink-tertiary">
              {summary.partial || query.isError
                ? "Partial / stale snapshot"
                : "All filtered results"}
            </p>
          </div>
        ))}
      </div>
      {!sources.length && !denied && (
        <p role="status" className="py-8 text-center text-sm text-ink-muted">
          {query.isError
            ? "Subscription data is unavailable."
            : query.data
              ? "No snapshot is available for this region."
              : query.focused
                ? "Loading subscriptions..."
                : "Focus this window to load subscriptions."}
        </p>
      )}
      {sources.map((source) => (
        <RegionalSubscriptionTable
          key={source.region}
          source={source}
          stale={query.isError}
          previous={Boolean(pages[source.region]?.length)}
          move={move}
          select={(receiver) =>
            setSelected({
              receiverId: receiver.receiver_id,
              region: source.region,
            })
          }
        />
      ))}
      {selected && selectedReceiver && !denied && (
        <ReceiverDetails
          receiver={selectedReceiver}
          region={selected.region}
          close={() => setSelected(null)}
        />
      )}
    </>
  );
}

function RegionalSubscriptionTable({
  source,
  stale,
  previous,
  move,
  select,
}: {
  source: RegionalSubscriptions;
  stale: boolean;
  previous: boolean;
  move: (region: string, cursor?: string) => void;
  select: (receiver: PushReceiver) => void;
}) {
  return (
    <section
      aria-label={`${regionName(source.region)} subscriptions`}
      className="overflow-hidden rounded-md border border-hairline bg-surface-1"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-3">
        <h2 className="text-sm font-medium">{regionName(source.region)}</h2>
        <span className="text-xs text-ink-muted">
          {!source.available || stale ? "Stale / unavailable" : "Updated"} ·{" "}
          {date(source.updated_at)}
        </span>
      </header>
      {source.registration_enabled === false && (
        <p className="border-b border-hairline px-4 py-3 text-sm text-warning">
          Push registration is not configured in this region.
        </p>
      )}
      {!source.receivers ? (
        <p className="p-6 text-sm text-warning">
          This region is unavailable. Its subscriptions are not counted as zero.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-hairline text-xs text-ink-tertiary">
                <tr>
                  {[
                    "Customer",
                    "Device",
                    "Subscription",
                    "Last registration",
                    "Latest delivery",
                    "",
                  ].map((label) => (
                    <th
                      key={label}
                      className="whitespace-nowrap px-4 py-3 font-medium"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {source.receivers.map((receiver) => (
                  <tr
                    key={receiver.receiver_id}
                    className="border-b border-hairline last:border-0"
                  >
                    <td className="max-w-64 px-4 py-3">
                      <Link
                        className="break-all text-ink hover:underline"
                        href={`/admin/customers?customer=${encodeURIComponent(receiver.email)}`}
                      >
                        {receiver.email}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block whitespace-nowrap">
                        {receiver.device_label || "Unnamed device"}
                      </span>
                      <span className="text-xs text-ink-tertiary">
                        {receiver.channel === "web_push"
                          ? "Web Push"
                          : receiver.channel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          receiver.status === "enabled"
                            ? "success"
                            : receiver.status === "expired" ||
                                receiver.status === "invalidated"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {receiver.status}
                      </Badge>
                      <p className="mt-1 whitespace-nowrap text-xs text-ink-muted">
                        Permission: {receiver.permission}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-muted">
                      {date(receiver.last_registered_at)}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-muted">
                      {receiver.latest_delivery ? (
                        <>
                          <span>
                            {receiver.latest_delivery.status === "accepted"
                              ? "Provider accepted"
                              : receiver.latest_delivery.status}
                          </span>
                          <p>{date(receiver.latest_delivery.attempted_at)}</p>
                        </>
                      ) : (
                        "No delivery attempts"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        type="button"
                        onClick={() => select(receiver)}
                      >
                        Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!source.receivers.length && (
            <p className="p-8 text-center text-sm text-ink-muted">
              {source.summary?.total === 0
                ? "No registered subscriptions match these filters."
                : "No subscriptions on this page."}
            </p>
          )}
          <footer className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3 text-xs text-ink-muted">
            <span>
              {source.receivers.length} shown ·{" "}
              {source.summary?.total ?? "Unknown"} matching
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                type="button"
                disabled={!previous || !source.available || stale}
                onClick={() => move(source.region)}
              >
                Previous
              </Button>
              <Button
                size="sm"
                type="button"
                disabled={!source.next_cursor || !source.available || stale}
                onClick={() => move(source.region, source.next_cursor)}
              >
                Next
              </Button>
            </div>
          </footer>
        </>
      )}
    </section>
  );
}

function ReceiverDetails({
  receiver,
  region,
  close,
}: {
  receiver: PushReceiver;
  region: string;
  close: () => void;
}) {
  const delivery = receiver.latest_delivery;
  return (
    <section
      aria-label="Receiver details"
      className="rounded-md border border-hairline bg-surface-1 p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">
          {receiver.device_label || "Receiver details"}
        </h2>
        <Button type="button" onClick={close}>
          Close
        </Button>
      </div>
      <dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-ink-tertiary">Receiver ID</dt>
          <dd className="mt-1">
            <MonoId>{receiver.receiver_id}</MonoId>
          </dd>
        </div>
        {[
          ["Customer", receiver.email],
          ["Subscription status", receiver.status],
          ["Region", regionName(region)],
          ["Revision", receiver.revision],
          ["Registered", date(receiver.created_at)],
          [
            "Permission reported",
            `${receiver.permission} · ${date(receiver.permission_reported_at)}`,
          ],
          ["Expires", date(receiver.expires_at)],
          [
            "Latest outcome",
            delivery?.status === "accepted"
              ? "Provider accepted"
              : (delivery?.status ?? "No delivery attempts"),
          ],
          ["Attempts", delivery?.attempts ?? "None"],
          ["Provider status", delivery?.provider_status ?? "Unknown"],
          ["Error category", delivery?.error_category ?? "None"],
          ["Next retry", date(delivery?.next_attempt_at)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-ink-tertiary">{label}</dt>
            <dd className="mt-1 break-words text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
