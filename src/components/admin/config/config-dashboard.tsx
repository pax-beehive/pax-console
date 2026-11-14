"use client";

import { useState } from "react";
import { useStore } from "zustand";
import { createConfigDashboardStore } from "@/stores/config-editor-store";
import { useMutation, useQuery, skipToken } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { AdminAnalyticsNav } from "@/components/analytics/admin-analytics-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchBox } from "@/components/ui/search-box";
import { Select } from "@/components/ui/form-controls";
import { MonoId, TruncatedText } from "@/components/ui/text";
import { AuthError } from "@/features/api/errors";
import { useI18n } from "@/features/i18n/use-i18n";
import {
  useConfigAdminStore,
  type ConfigTab,
} from "@/stores/config-admin-store";
import {
  useRuntimeConfig,
  useConfigAudit,
  testConfig,
  type ConfigEntry,
  type FeatureStage,
} from "@/features/runtime-config";
import { ConfigEditor } from "./config-editor";
import {
  displayValue,
  featureLabels,
  featureValue,
  sources,
  stages,
} from "./config-display";

const tabLabels: Record<ConfigTab, string> = {
  features: "Feature flags",
  settings: "Service settings",
  audit: "Change history",
};

export function ConfigDashboard({ userId }: { userId: string }) {
  const { t, locale } = useI18n();
  const { region, tab, setRegion, setTab } = useConfigAdminStore();
  const query = useRuntimeConfig(userId, region);
  const [pageStore] = useState(createConfigDashboardStore);
  const { edit, setEdit, search, setSearch, auditKey, setAuditKey } =
    useStore(pageStore);
  const audit = useConfigAudit(
    userId,
    region,
    auditKey || undefined,
    tab === "audit",
  );
  const denied =
    query.error instanceof AuthError || audit.error instanceof AuthError;
  const snapshot = denied ? undefined : query.data;
  const entries = snapshot?.entries ?? [];
  const edited = entries.find((entry) => entry.key === edit?.key);
  // Keep the selected server record in Query even if a newly added audit row
  // shifts it out of the visible first page while the revert drawer is open.
  const editedAudit = useQuery({
    queryKey: ["runtime-config-audit-item", userId, region, edit?.auditId],
    queryFn: skipToken,
    initialData: () =>
      audit.data?.pages
        .flatMap((page) => page.items)
        .find((item) => item.id === edit?.auditId),
    enabled: false,
  }).data;
  const filtered = entries.filter((entry) =>
    `${entry.key} ${t(featureLabels[entry.key] ?? entry.label)}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const groups = [
    ...new Set(
      filtered
        .filter((entry) => entry.kind === "setting")
        .map((entry) => entry.group),
    ),
  ];
  const date = (value: string | null) =>
    value ? new Date(value).toLocaleString(locale) : t("Unknown");

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto grid max-w-6xl gap-5">
        <AdminAnalyticsNav />
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">
              {t("Runtime configuration")}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              {t("Control feature access and regional service settings.")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="config-region">
              {t("Region")}
            </label>
            <Select
              id="config-region"
              className="w-auto"
              value={region}
              onChange={(event) => {
                setEdit(undefined);
                setRegion(event.target.value as "us" | "hk");
              }}
            >
              <option value="us">US</option>
              <option value="hk">HK</option>
            </Select>
            <Button
              aria-label={t("Refresh configuration")}
              tooltip={t("Refresh configuration")}
              icon={<RefreshCw className="h-4 w-4" />}
              size="icon"
              variant="ghost"
              disabled={query.isFetching}
              onClick={() => {
                void query.refetch();
                if (tab === "audit") void audit.refetch();
              }}
            />
          </div>
        </header>
        {denied ? (
          <p role="alert" className="text-sm text-danger">
            {t(
              "Administrator access is required. Previously loaded data is hidden.",
            )}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-subtle">
              <Badge
                tone={
                  snapshot?.health.degraded
                    ? "warning"
                    : snapshot
                      ? "success"
                      : "neutral"
                }
              >
                {snapshot
                  ? snapshot.health.degraded
                    ? t("Degraded")
                    : t("Synced")
                  : t("Loading...")}
              </Badge>
              {snapshot && (
                <>
                  <span>
                    {t("Revision {revision}", { revision: snapshot.revision })}
                  </span>
                  <span>
                    {t("Last refresh: {time}", {
                      time: date(snapshot.health.last_refresh_at),
                    })}
                  </span>
                  <Badge
                    tone={snapshot.vault_configured ? "success" : "warning"}
                  >
                    {snapshot.vault_configured
                      ? t("Vault configured")
                      : t("Vault not configured")}
                  </Badge>
                  {snapshot.health.refresh_failures > 0 && (
                    <span>
                      {t("Refresh failures: {count}", {
                        count: snapshot.health.refresh_failures,
                      })}
                    </span>
                  )}
                </>
              )}
            </div>
            {query.isError && (
              <p role="alert" className="text-sm text-warning">
                {t(
                  "Could not refresh configuration. Check the selected region and retry.",
                )}
              </p>
            )}
            <div
              role="tablist"
              aria-label={t("Configuration sections")}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                const tabs = Array.from(
                  event.currentTarget.querySelectorAll<HTMLButtonElement>(
                    '[role="tab"]',
                  ),
                );
                const current = tabs.indexOf(
                  document.activeElement as HTMLButtonElement,
                );
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? tabs.length - 1
                      : (current +
                          (event.key === "ArrowRight" ? 1 : -1) +
                          tabs.length) %
                        tabs.length;
                event.preventDefault();
                tabs[next]?.focus();
                tabs[next]?.click();
              }}
              className="flex gap-2 border-b border-hairline pb-2"
            >
              {(Object.keys(tabLabels) as ConfigTab[]).map((key) => (
                <Button
                  key={key}
                  role="tab"
                  id={`config-tab-${key}`}
                  aria-controls="config-panel"
                  aria-selected={tab === key}
                  tabIndex={tab === key ? 0 : -1}
                  variant={tab === key ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setTab(key)}
                >
                  {t(tabLabels[key])}
                </Button>
              ))}
            </div>
            <section
              role="tabpanel"
              id="config-panel"
              aria-labelledby={`config-tab-${tab}`}
              className="min-w-0"
            >
              {tab !== "audit" && (
                <SearchBox
                  className="mb-3"
                  aria-label={t("Search configuration")}
                  placeholder={t("Search configuration")}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              )}
              {tab === "features" && (
                <>
                  {filtered
                    .filter((entry) => entry.kind === "feature")
                    .map((entry) => (
                      <div
                        key={entry.key}
                        className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline py-4"
                      >
                        <EntrySummary entry={entry} />
                        <div
                          className="flex max-w-full flex-wrap items-center gap-1"
                          role="group"
                          aria-label={t(
                            featureLabels[entry.key] ?? entry.label,
                          )}
                        >
                          {(Object.keys(stages) as FeatureStage[]).map(
                            (stage) => (
                              <Button
                                size="sm"
                                variant={
                                  featureValue(entry).stage === stage
                                    ? "secondary"
                                    : "ghost"
                                }
                                key={stage}
                                aria-pressed={
                                  featureValue(entry).stage === stage
                                }
                                onClick={() =>
                                  setEdit({ key: entry.key, stage })
                                }
                              >
                                {t(stages[stage])}
                              </Button>
                            ),
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={t("Edit {name}", {
                              name: t(featureLabels[entry.key] ?? entry.label),
                            })}
                            onClick={() => setEdit({ key: entry.key })}
                          >
                            {t("Edit")}
                          </Button>
                        </div>
                      </div>
                    ))}
                  <p className="mt-4 text-xs leading-6 text-ink-tertiary">
                    {t(
                      "Opening or disabling a feature for everyone requires confirmation.",
                    )}
                    <br />
                    {t(
                      "Changes apply only to the selected region unless you choose both.",
                    )}
                  </p>
                </>
              )}
              {tab === "settings" &&
                groups.map((group) => (
                  <section key={group} className="mb-6">
                    <header className="flex items-center justify-between gap-3 border-b border-hairline py-3">
                      <h2 className="text-sm font-medium">{t(group)}</h2>
                      {filtered.some(
                        (entry) => entry.group === group && entry.testable,
                      ) && (
                        <GroupTest
                          key={`${region}:${group}`}
                          region={region}
                          group={group}
                        />
                      )}
                    </header>
                    {filtered
                      .filter(
                        (entry) =>
                          entry.group === group && entry.kind === "setting",
                      )
                      .map((entry) => (
                        <div
                          key={entry.key}
                          className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline py-4"
                        >
                          <EntrySummary entry={entry} />
                          <div className="flex min-w-0 max-w-full items-center gap-3">
                            <TruncatedText className="max-w-64 text-sm text-ink-muted">
                              {displayValue(entry) ?? t("Not set")}
                            </TruncatedText>
                            <Button
                              size="sm"
                              variant="secondary"
                              aria-label={t("Edit {name}", {
                                name: t(entry.label),
                              })}
                              onClick={() => setEdit({ key: entry.key })}
                            >
                              {entry.secret ? t("Set") : t("Edit")}
                            </Button>
                          </div>
                        </div>
                      ))}
                  </section>
                ))}
              {tab === "audit" && (
                <>
                  <label
                    htmlFor="config-audit-key"
                    className="text-xs text-ink-subtle"
                  >
                    {t("Configuration key")}
                  </label>
                  <Select
                    id="config-audit-key"
                    className="mt-2 mb-4 max-w-sm"
                    value={auditKey}
                    onChange={(event) => setAuditKey(event.target.value)}
                  >
                    <option value="">{t("All keys")}</option>
                    {entries.map((entry) => (
                      <option key={entry.key}>{entry.key}</option>
                    ))}
                  </Select>
                  {audit.isError && (
                    <p role="alert" className="text-sm text-warning">
                      {t("Could not load change history.")}
                    </p>
                  )}
                  {audit.isPending && (
                    <p className="text-sm text-ink-muted">{t("Loading...")}</p>
                  )}
                  {audit.data?.pages
                    .flatMap((page) => page.items)
                    .map((item) => (
                      <article
                        key={item.id}
                        className="grid gap-2 border-b border-hairline py-4"
                      >
                        <div className="flex flex-wrap justify-between gap-2">
                          <MonoId>{item.key}</MonoId>
                          <span className="text-xs text-ink-tertiary">
                            {date(item.created_at)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="break-all text-sm">
                              {item.old_display ?? t("Not set")} →{" "}
                              {item.new_display ?? t("Not set")}
                            </p>
                            <p className="mt-1 break-words text-xs text-ink-subtle">
                              {item.actor} · {t(item.action)} · v{item.version}
                            </p>
                            <p className="mt-2 break-words text-sm text-ink-muted">
                              {item.reason}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={
                              !item.revertible ||
                              !entries.some((entry) => entry.key === item.key)
                            }
                            onClick={() =>
                              setEdit({ key: item.key, auditId: item.id })
                            }
                          >
                            {t("Revert")}
                          </Button>
                        </div>
                      </article>
                    ))}
                  {audit.isSuccess &&
                    !audit.data.pages.some((page) => page.items.length) && (
                      <p className="py-8 text-sm text-ink-muted">
                        {t("No changes recorded.")}
                      </p>
                    )}
                  {audit.hasNextPage && (
                    <Button
                      className="mt-4"
                      variant="secondary"
                      disabled={audit.isFetchingNextPage}
                      onClick={() => void audit.fetchNextPage()}
                    >
                      {t("Load more")}
                    </Button>
                  )}
                </>
              )}
            </section>
            {edit && edited && snapshot && (
              <ConfigEditor
                key={`${region}:${edit.key}:${edit.auditId ?? "edit"}`}
                userId={userId}
                region={region}
                entry={edited}
                snapshot={snapshot}
                initialStage={edit.stage}
                audit={editedAudit}
                onClose={() => setEdit(undefined)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EntrySummary({ entry }: { entry: ConfigEntry }) {
  const { t, locale } = useI18n();
  return (
    <div className="min-w-0">
      <h3 className="text-sm font-medium">
        {t(featureLabels[entry.key] ?? entry.label)}
      </h3>
      <MonoId className="mt-1">{entry.key}</MonoId>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-tertiary">
        <Badge>{t(sources[entry.source])}</Badge>
        <span>v{entry.version}</span>
        <span>
          {entry.pending_restart
            ? t("Restart required")
            : entry.apply === "live"
              ? t("Live")
              : t("Applies after restart")}
        </span>
        {entry.env_var && <MonoId>{entry.env_var}</MonoId>}
      </div>
      {entry.type === "feature" && featureValue(entry).stage === "beta" && (
        <p className="mt-2 break-all text-xs text-ink-subtle">
          {t("Beta emails")}:{" "}
          {featureValue(entry).beta_emails.join(", ") || t("None")}
        </p>
      )}
      {entry.updated_at && (
        <p className="mt-2 text-xs text-ink-tertiary">
          {entry.updated_by} ·{" "}
          {new Date(entry.updated_at).toLocaleString(locale)}
        </p>
      )}
    </div>
  );
}

function GroupTest({ region, group }: { region: "us" | "hk"; group: string }) {
  const { t } = useI18n();
  const test = useMutation({
    mutationFn: () => testConfig(region, { group, overrides: {} }),
    retry: false,
  });
  return (
    <div className="text-right">
      <Button
        size="sm"
        variant="secondary"
        disabled={test.isPending}
        onClick={() => test.mutate()}
      >
        {test.isPending ? t("Testing...") : t("Test connection")}
      </Button>
      {test.data && (
        <p
          role="status"
          className={`mt-2 text-xs ${test.data.ok ? "text-success" : "text-danger"}`}
        >
          {test.data.ok
            ? t("Connection succeeded ({ms} ms)", { ms: test.data.latency_ms })
            : t("Connection failed")}
        </p>
      )}
      {test.isError && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {t("Connection failed")}
        </p>
      )}
    </div>
  );
}
