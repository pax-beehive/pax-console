"use client";

import { useState } from "react";
import { AuthGate } from "@/features/auth/auth-gate";
import { canSeeAdminFeatures } from "@/features/auth/admin-view";
import { useConsoleStore } from "@/stores/console-store";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchBox } from "@/components/ui/search-box";
import { useCustomerAnalytics } from "@/features/analytics/use-customer-analytics";
import {
  customerStage,
  mergeCustomers,
  type Customer,
  type MergedCustomer,
} from "@/features/analytics/customer-data";
import type { User } from "@/features/api/types";
import { AuthError } from "@/features/api/errors";

export function CustomerAnalyticsPage() {
  return (
    <AuthGate>
      {(user) => (
        <ConsoleLayout user={user}>
          <CustomerAnalyticsAccess user={user} />
        </ConsoleLayout>
      )}
    </AuthGate>
  );
}

export function CustomerAnalyticsAccess({ user }: { user: User }) {
  const previewAsUser = useConsoleStore((state) => state.previewAsUser);
  if (!canSeeAdminFeatures(user, previewAsUser))
    return (
      <div className="p-6 text-sm text-ink-muted">
        Customer analytics is available to administrators.
      </div>
    );
  return <CustomerAnalyticsDashboard userId={user.user_id} />;
}

const regionLabel = (region: string) =>
  ({ us: "United States", hk: "Hong Kong", local: "Local" })[region] ?? region;
const date = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString() : "Unknown";
const stageLabel = (user: Customer) =>
  ({
    sent: "Has sent messages",
    bound: "Bound, no confirmed sends",
    encrypted: "Encrypted activity",
    unbound: "Not bound",
  })[customerStage(user)];
const selectClass =
  "min-h-9 rounded-md border border-hairline bg-surface-1 px-2 text-sm text-ink";

export function CustomerAnalyticsDashboard({ userId }: { userId: string }) {
  const query = useCustomerAnalytics(userId);
  const [audience, setAudience] = useState("regular");
  const [region, setRegion] = useState("all");
  const [stage, setStage] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const accessDenied = query.error instanceof AuthError;
  const sources = accessDenied ? [] : (query.data?.regions ?? []);
  const users = mergeCustomers({ regions: sources }, region).filter(
    (user) => audience === "all" || !user.is_admin,
  );
  const shown = users.filter((user) => {
    if (!user.email.includes(search.trim().toLowerCase())) return false;
    if (stage === "bound") return user.agents > 0;
    if (stage === "sent") return user.user_messages > 0;
    if (stage === "unbound") return user.agents === 0;
    return true;
  });
  const detail = shown.find((user) => user.email === selected);
  const relevant = sources.filter(
    (source) => region === "all" || source.region === region,
  );
  const missing = !relevant.length || relevant.some((source) => !source.users);
  const stale = query.isError || relevant.some((source) => !source.available);
  const now = query.dataUpdatedAt ?? 0;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const visitCount = users.filter(
    (user) =>
      user.last_visit_at && Date.parse(user.last_visit_at) >= today.getTime(),
  ).length;
  const recent = users.filter(
    (user) =>
      user.last_visit_at && now - Date.parse(user.last_visit_at) < 90_000,
  ).length;
  const stats = [
    { id: "all", label: "Accounts", count: users.length },
    {
      id: "bound",
      label: "Currently bound",
      count: users.filter((user) => user.agents > 0).length,
    },
    {
      id: "sent",
      label: "Confirmed senders",
      count: users.filter((user) => user.user_messages > 0).length,
    },
  ];
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto grid max-w-6xl gap-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-ink">
              Customer analytics
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              Accounts, real agent connections, and usage across regions.
            </p>
          </div>
          <Badge tone={query.focused ? "success" : "neutral"}>
            {accessDenied
              ? "Paused · access denied"
              : !query.focused
                ? "Paused · not focused"
                : query.isError
                  ? "Retrying with backoff"
                  : "Live · 15s"}
          </Badge>
        </header>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2 text-ink-muted">
            Audience
            <select
              aria-label="Audience"
              className={selectClass}
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            >
              <option value="regular">Non-admin accounts</option>
              <option value="all">All accounts</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-ink-muted">
            Region
            <select
              aria-label="Region"
              className={selectClass}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              <option value="all">All regions</option>
              {sources.map((source) => (
                <option value={source.region} key={source.region}>
                  {regionLabel(source.region)}
                </option>
              ))}
            </select>
          </label>
          <span className="text-xs text-ink-tertiary">
            All time · deduplicated by email · local test account excluded
          </span>
        </div>
        {query.isError && (
          <p role="alert" className="text-sm text-danger">
            Unable to refresh analytics. Previously loaded values remain
            visible. {query.error.message}
          </p>
        )}
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-muted">
          {sources.map((source) => (
            <span key={source.region}>
              {regionLabel(source.region)}:{" "}
              {source.available ? "Updated" : "Delayed"}{" "}
              {date(source.updated_at)}
            </span>
          ))}
        </div>
        {(missing || stale) && (
          <p role="status" className="text-sm text-warning">
            {missing
              ? "Waiting for a complete regional snapshot. Counts are unavailable until every selected region has data."
              : "Some values are from an older snapshot. Regional timestamps show their freshness."}
          </p>
        )}
        <div className="grid grid-cols-3 divide-x divide-hairline border-y border-hairline py-3">
          {stats.map((stat) => (
            <button
              type="button"
              key={stat.id}
              aria-pressed={stage === stat.id}
              onClick={() => setStage(stat.id)}
              className={`min-w-0 px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-accent ${stage === stat.id ? "bg-accent/10" : "hover:bg-surface-2"}`}
            >
              <span className="text-xs text-ink-muted">{stat.label}</span>
              <span className="mt-1 block text-2xl font-semibold tabular-nums text-ink">
                {missing ? "—" : stat.count}
              </span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-subtle">
          <span>Visited today: {missing ? "—" : visitCount}</span>
          <span>Seen in last 90s: {missing ? "—" : recent}</span>
          <span className="text-xs text-ink-tertiary">
            Focused Console visits only; collection starts with this release.
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SearchBox
            aria-label="Search customers"
            placeholder="Search email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            Stage
            <select
              aria-label="Stage"
              className={selectClass}
              value={stage}
              onChange={(e) => setStage(e.target.value)}
            >
              <option value="all">All stages</option>
              <option value="unbound">Not bound</option>
              <option value="bound">Currently bound</option>
              <option value="sent">Confirmed senders</option>
            </select>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-hairline text-xs text-ink-tertiary">
              <tr>
                {[
                  "User",
                  "Region",
                  "Created",
                  "Last visit",
                  "Agents",
                  "Status",
                ].map((label) => (
                  <th
                    key={label}
                    className="whitespace-nowrap px-3 py-2 font-medium"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((user) => (
                <tr
                  key={user.email}
                  className={`border-b border-hairline ${selected === user.email ? "bg-accent/10" : ""}`}
                >
                  <td className="px-3 py-3">
                    <button
                      className="text-left text-ink hover:underline"
                      type="button"
                      onClick={() =>
                        setSelected(user.email === selected ? null : user.email)
                      }
                    >
                      {user.email}
                    </button>
                    {user.is_admin && (
                      <span className="ml-2 text-xs text-ink-tertiary">
                        Admin
                      </span>
                    )}
                    {user.stale && (
                      <span className="ml-2 text-xs text-warning">Stale</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-ink-muted">
                    {user.regions.map(regionLabel).join(" / ")}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-ink-muted">
                    {date(user.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-ink-muted">
                    {date(user.last_visit_at)}
                  </td>
                  <td className="px-3 py-3 tabular-nums">{user.agents}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-ink-muted">
                    {stageLabel(user)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shown.length && (
            <p className="py-8 text-center text-sm text-ink-muted">
              {query.data
                ? "No accounts match these filters."
                : query.focused
                  ? "Loading customer analytics..."
                  : "Focus this window to load analytics."}
            </p>
          )}
        </div>
        {detail && (
          <CustomerDetail user={detail} close={() => setSelected(null)} />
        )}
        <footer className="text-xs leading-5 text-ink-tertiary">
          {shown.length} of {users.length} accounts · Dates use your local
          timezone. Administrator status is a permission, not a customer
          classification. Encrypted records are not counted as confirmed user
          sends; a missing visit date means unknown.
        </footer>
      </div>
    </div>
  );
}

function CustomerDetail({
  user,
  close,
}: {
  user: MergedCustomer;
  close: () => void;
}) {
  return (
    <section
      aria-label="Customer details"
      className="border-t border-hairline pt-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="break-all text-sm font-medium">{user.email}</h2>
        <Button type="button" variant="ghost" onClick={close}>
          Close
        </Button>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        {[
          ["Devices", user.devices],
          ["Current agents", user.agents],
          ["Sessions", user.sessions],
          ["Confirmed user messages", user.user_messages],
          ["First recorded visit", date(user.first_visit_at)],
          ["First known binding", date(user.first_bound_at)],
          ["First confirmed send", date(user.first_message_at)],
          ["Last confirmed send", date(user.last_message_at)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-ink-tertiary">{label}</dt>
            <dd className="mt-1 text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {user.encrypted_records > 0 && (
        <p className="mt-3 text-xs text-ink-muted">
          Encrypted history is present. Message roles and exact send totals are
          not visible to analytics.
        </p>
      )}
    </section>
  );
}
