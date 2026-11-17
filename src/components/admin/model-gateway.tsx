"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { AdminAnalyticsNav } from "@/components/analytics/admin-analytics-nav";
import { useI18n } from "@/features/i18n/use-i18n";
import type { Translator } from "@/features/i18n/translate";
import { SettingsBack } from "@/components/settings/settings-navigation";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchBox } from "@/components/ui/search-box";
import { SettingsToggle } from "@/components/ui/settings-controls";
import { MonoId } from "@/components/ui/text";
import { AuthGate } from "@/features/auth/auth-gate";
import { canSeeAdminFeatures } from "@/features/auth/admin-view";
import { ApiError, AuthError } from "@/features/api/errors";
import {
  changeHostingAdmin,
  dollarsToMicrousd,
  formatHostingDollars,
  formatHostingBudgetReset,
  hostingAdminKey,
  microusdToDollars,
  parseTokenLimit,
  readHostingAdmin,
  type HostingAdminChange,
  type HostingAdminFilter,
  type HostingAdminSnapshot,
  type HostingAdminUser,
  type HostingModelPolicy,
} from "@/features/api/hosting-admin";
import { modelCatalogKey } from "@/features/api/model-catalog";
import type { User } from "@/features/api/types";
import { useConsoleStore } from "@/stores/console-store";
import {
  GatewayField,
  GatewayForm,
  gatewayInputClass,
  type GatewayFormValues,
} from "./model-gateway-form";

import { AddModel } from "./model-gateway-create";

type Save = (change: HostingAdminChange) => Promise<HostingAdminSnapshot>;
const number = (value: number) => value.toLocaleString("en-US");
const money = (value: number) => formatHostingDollars(value);
const dollars = (values: GatewayFormValues, key: string) =>
  dollarsToMicrousd(String(values[key]));
const tokens = (values: GatewayFormValues, key: string, minimum = 0) =>
  parseTokenLimit(String(values[key]), minimum);

export function ModelGatewayPage() {
  return (
    <AuthGate>
      {(user) => (
        <ConsoleLayout user={user}>
          <ModelGatewayAccess user={user} />
        </ConsoleLayout>
      )}
    </AuthGate>
  );
}

function AccessDenied() {
  const { t } = useI18n();
  return (
    <p role="alert" className="p-6 text-sm text-ink-muted">
      {t(
        "Model gateway management is available to administrators. Access denied. Sign in to the Manager deployment you want to manage.",
      )}
    </p>
  );
}

export function ModelGatewayAccess({ user }: { user: User }) {
  const preview = useConsoleStore((state) => state.previewAsUser);
  if (!canSeeAdminFeatures(user, preview)) return <AccessDenied />;
  return <AuthorizedGateway key={user.user_id} userId={user.user_id} />;
}

function AuthorizedGateway({ userId }: { userId: string }) {
  const client = useQueryClient();
  const [denied, setDenied] = useState(false);
  const clear = useCallback(() => {
    for (const queryKey of [hostingAdminKey(userId), modelCatalogKey(userId)]) {
      void client.cancelQueries({ queryKey });
      client.removeQueries({ queryKey });
    }
  }, [client, userId]);
  const deny = useCallback(() => {
    setDenied(true);
    clear();
  }, [clear]);
  useEffect(() => clear, [clear]);
  if (denied) return <AccessDenied />;
  return <ModelGatewayDashboard userId={userId} onDenied={deny} />;
}

function ModelGatewayDashboard({
  userId,
  onDenied,
}: {
  userId: string;
  onDenied: () => void;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const [filter, setFilter] = useState<HostingAdminFilter>({});
  const [userSearch, setUserSearch] = useState("");
  const [requestStatus, setRequestStatus] = useState("");
  const query = useQuery({
    queryKey: [...hostingAdminKey(userId), filter],
    queryFn: async ({ signal }) => {
      try {
        return await readHostingAdmin(filter, signal);
      } catch (error) {
        if (error instanceof AuthError) {
          onDenied();
          client.removeQueries({ queryKey: hostingAdminKey(userId) });
        }
        throw error;
      }
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  const save: Save = async (change) => {
    try {
      const result = await changeHostingAdmin(change);
      // PATCH returns the first page. Refetch the active filters/cursors instead
      // of replacing a later page with unrelated rows from that response.
      await client.invalidateQueries({ queryKey: hostingAdminKey(userId) });
      return result;
    } catch (error) {
      if (error instanceof AuthError) {
        onDenied();
        client.removeQueries({ queryKey: hostingAdminKey(userId) });
      } else if (error instanceof ApiError && error.status === 409) {
        await query.refetch();
      }
      throw error;
    }
  };

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setFilter({
      ...(userSearch.trim() ? { user_query: userSearch.trim() } : {}),
      ...(requestStatus.trim() ? { request_status: requestStatus.trim() } : {}),
    });
  }

  const snapshot = query.data;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 px-4 pt-4 sm:px-6">
        <SettingsBack />
        <AdminAnalyticsNav />
        <header className="flex flex-wrap items-start justify-between gap-3 py-4">
          <div>
            <h1 className="text-xl font-semibold text-ink">
              {t("Model gateway")}
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-ink-muted">
              {t(
                "Manage the free model pool, monthly allowances, and configured model policies for this region.",
              )}
            </p>
          </div>
          <Button
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
            icon={
              <RefreshCw
                aria-hidden="true"
                className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`}
              />
            }
          >
            {t("Refresh settings")}
          </Button>
        </header>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto border-t border-hairline px-4 sm:px-6">
        {query.isPending ? (
          <p role="status" className="py-6 text-sm text-ink-muted">
            {t("Loading model gateway…")}
          </p>
        ) : !snapshot ? (
          <p role="alert" className="py-6 text-sm text-warning">
            {t(
              "Could not load model gateway settings{status}. Refresh to try again.",
              {
                status:
                  query.error instanceof ApiError
                    ? ` (HTTP ${query.error.status})`
                    : "",
              },
            )}
          </p>
        ) : (
          <>
            {query.isError ? (
              <p
                role="alert"
                className="border-b border-hairline py-3 text-xs text-warning"
              >
                {t(
                  "Could not refresh settings. Last loaded values and your edits are preserved. Refresh before saving.",
                )}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-3 border-b border-hairline py-3 text-xs text-ink-tertiary">
              <Badge tone={snapshot.enabled ? "success" : "warning"}>
                {t(snapshot.enabled ? "Hosting enabled" : "Hosting disabled")}
              </Badge>
              <span>
                {t("Configuration revision {revision}", {
                  revision: snapshot.revision,
                })}
              </span>
              <span>{t("Current regional Manager · amounts in USD")}</span>
            </div>
            <div className="grid min-w-0 gap-6 border-b border-hairline py-5 xl:grid-cols-2">
              <PoolSettings snapshot={snapshot} save={save} />
              <DefaultSettings snapshot={snapshot} save={save} />
            </div>
            <Section
              title={t("Configured models")}
              description={t(
                "Provider and upstream identities come from server configuration. Credentials stay on the server.",
              )}
            >
              <AddModel
                revision={snapshot.revision}
                save={save}
                userId={userId}
                onDenied={onDenied}
                existingModels={snapshot.models}
              />
              {snapshot.models.length ? (
                snapshot.models.map((model) => (
                  <ModelSettings
                    key={model.id}
                    model={model}
                    modelBase={snapshot.model_bases[model.id]}
                    warning={snapshot.model_warnings?.[model.id]}
                    revision={snapshot.revision}
                    save={save}
                  />
                ))
              ) : (
                <Empty>{t("No configured models.")}</Empty>
              )}
            </Section>
            <Section
              title={t("Users and requests")}
              description={t(
                "Search by exact email or user ID. Filters apply to both lists; changing filters returns to their first pages.",
              )}
            >
              <form
                aria-label={t("Filter users and requests")}
                onSubmit={applyFilters}
                className="mb-4 flex flex-wrap items-end gap-2"
              >
                <div className="min-w-0 flex-1 basis-64">
                  <SearchBox
                    aria-label={t("Email or user ID")}
                    placeholder={t("Email or user ID")}
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                  />
                </div>
                <label className="grid min-w-0 gap-1 text-xs text-ink-muted">
                  {t("Request status")}
                  <select
                    className={gatewayInputClass}
                    value={requestStatus}
                    onChange={(event) => setRequestStatus(event.target.value)}
                  >
                    <option value="">{t("All statuses")}</option>
                    <option value="reserved">{t("Reserved")}</option>
                    <option value="settled">{t("Settled")}</option>
                    <option value="conservative">
                      {t("Conservative settlement")}
                    </option>
                    <option value="moderation_blocked">
                      {t("Moderation blocked")}
                    </option>
                    <option value="moderation_unavailable">
                      {t("Moderation unavailable")}
                    </option>
                    <option value="moderation_interrupted">
                      {t("Moderation interrupted")}
                    </option>
                    <option value="generation_canceled">
                      {t("Generation canceled")}
                    </option>
                  </select>
                </label>
                <Button type="submit" size="sm">
                  {t("Apply filters")}
                </Button>
              </form>
              <h3 className="text-sm font-medium text-ink">
                {t("User allowances")}
              </h3>
              <p className="mt-1 text-xs leading-5 text-ink-tertiary">
                {t(
                  "A user override takes effect immediately and persists into future months. Reducing a cap preserves spend and reservations. Pausing access stops new free model requests.",
                )}
              </p>
              <div className="mt-3">
                {snapshot.users.length ? (
                  snapshot.users.map((user) => (
                    <UserSettings
                      key={user.user_id}
                      user={user}
                      revision={snapshot.revision}
                      save={save}
                    />
                  ))
                ) : (
                  <Empty>{t("No matching free users.")}</Empty>
                )}
              </div>
              <Pagination
                label={t("users")}
                hasCursor={Boolean(filter.users_after)}
                next={snapshot.users_next}
                onFirst={() =>
                  setFilter((current) => ({
                    ...current,
                    users_after: undefined,
                  }))
                }
                onNext={(cursor) =>
                  setFilter((current) => ({ ...current, users_after: cursor }))
                }
              />
              <h3 className="mt-6 text-sm font-medium text-ink">
                {t("Model requests")}
              </h3>
              <p className="mt-1 text-xs leading-5 text-ink-tertiary">
                {t(
                  "Ledger records are shown once per request. Reserved amounts are holds, not additional charges. Failure codes contain no prompt or provider response body.",
                )}
              </p>
              <RequestList requests={snapshot.requests} />
              <Pagination
                label={t("requests")}
                hasCursor={Boolean(filter.requests_before)}
                next={snapshot.requests_next}
                onFirst={() =>
                  setFilter((current) => ({
                    ...current,
                    requests_before: undefined,
                  }))
                }
                onNext={(cursor) =>
                  setFilter((current) => ({
                    ...current,
                    requests_before: cursor,
                  }))
                }
              />
            </Section>
            <Section
              title={t("Configuration audit")}
              description={t(
                "Saved changes record the administrator, action, target, revision, and time.",
              )}
            >
              {snapshot.audit.length ? (
                <ul className="divide-y divide-hairline">
                  {snapshot.audit.map((entry) => (
                    <li
                      key={entry.revision}
                      className="grid min-w-0 gap-1 py-3 text-xs text-ink-muted sm:grid-cols-[6rem_1fr_1fr_1fr]"
                    >
                      <span>
                        {t("Revision {revision}", { revision: entry.revision })}
                      </span>
                      <span>
                        {entry.action}
                        <MonoId>{entry.target_id || t("Platform")}</MonoId>
                      </span>
                      <span>
                        {t("Administrator")}
                        <MonoId>{entry.actor_user_id}</MonoId>
                      </span>
                      <time dateTime={entry.created_at}>
                        {formatTime(entry.created_at, t)}
                      </time>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>{t("No configuration changes recorded.")}</Empty>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <section
      aria-label={t(title)}
      className="min-w-0 border-b border-hairline py-5"
    >
      <h2 className="text-sm font-semibold text-ink">{t(title)}</h2>
      <p className="mt-1 mb-4 text-xs leading-5 text-ink-tertiary">
        {t(description)}
      </p>
      {children}
    </section>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="py-4 text-sm text-ink-tertiary">{children}</p>;
}

function PoolSettings({
  snapshot,
  save,
}: {
  snapshot: HostingAdminSnapshot;
  save: Save;
}) {
  const { t } = useI18n();
  const { pool } = snapshot;
  const hasBudget = pool.remaining_microusd > 0;
  const budgetStatus =
    pool.monthly_limit_microusd === 0
      ? "Zero budget"
      : hasBudget
        ? "Funded"
        : "Exhausted";
  // Availability also depends on hosting readiness and the accounting period;
  // it cannot establish whether the monetary budget has been consumed.
  const accessNotice = !snapshot.enabled
    ? "Free model requests are disabled. Changing the budget does not enable hosting."
    : hasBudget && !pool.available
      ? "Free model requests are currently unavailable despite the remaining budget."
      : null;
  const reset = formatHostingBudgetReset(pool.period_start, pool.resets_at);
  return (
    <section aria-label={t("Platform pool")} className="min-w-0">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-ink">{t("Platform pool")}</h2>
        <Badge tone={hasBudget ? "success" : "warning"}>
          {t(budgetStatus)}
        </Badge>
      </div>
      {accessNotice ? (
        <p className="mb-3 text-xs leading-5 text-ink-tertiary">
          {t(accessNotice)}
        </p>
      ) : null}
      <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {[
          ["Monthly limit", pool.monthly_limit_microusd],
          ["Spent", pool.spent_microusd],
          ["Reserved", pool.reserved_microusd],
          ["Remaining", pool.remaining_microusd],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-ink-tertiary">{t(String(label))}</dt>
            <dd className="mt-1 font-mono text-sm text-ink">
              {money(Number(value))}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mb-3 text-xs leading-5 text-ink-tertiary">
        {reset
          ? t("Resets {date} (UTC).", { date: reset })
          : t("Reset date unavailable.")}{" "}
        {t(
          "Unused budget does not carry over. A changed cap preserves current spend and holds.",
        )}
      </p>
      <GatewayForm
        label={t("Platform pool")}
        revision={snapshot.revision}
        values={{
          monthly_microusd: microusdToDollars(pool.monthly_limit_microusd),
        }}
        buildChange={(draft) => ({
          action: "pool",
          monthly_microusd: dollars(draft, "monthly_microusd"),
        })}
        save={save}
      >
        {(draft, change) => (
          <GatewayField
            label={t("Platform monthly budget (USD)")}
            value={draft.monthly_microusd}
            onChange={(value) => change("monthly_microusd", value)}
          />
        )}
      </GatewayForm>
    </section>
  );
}

function DefaultSettings({
  snapshot,
  save,
}: {
  snapshot: HostingAdminSnapshot;
  save: Save;
}) {
  const { t } = useI18n();
  return (
    <section
      aria-label={t("Default allowance")}
      className="min-w-0 xl:border-l xl:border-hairline xl:pl-6"
    >
      <h2 className="text-sm font-semibold text-ink">
        {t("Default monthly allowance")}
      </h2>
      <p className="mt-2 mb-4 text-xs leading-5 text-ink-tertiary">
        {t(
          "Applies to new free users and future monthly resets without a user override. Both the dollar and token limits apply. Zero disables that allowance.",
        )}
      </p>
      <GatewayForm
        label={t("Default allowance")}
        revision={snapshot.revision}
        values={{
          monthly_microusd: microusdToDollars(
            snapshot.defaults.monthly_microusd,
          ),
          monthly_tokens: String(snapshot.defaults.monthly_tokens),
        }}
        buildChange={(draft) => ({
          action: "defaults",
          monthly_microusd: dollars(draft, "monthly_microusd"),
          monthly_tokens: tokens(draft, "monthly_tokens"),
        })}
        save={save}
      >
        {(draft, change) => (
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <GatewayField
              label={t("Default monthly budget (USD)")}
              value={draft.monthly_microusd}
              onChange={(value) => change("monthly_microusd", value)}
            />
            <GatewayField
              numeric
              label={t("Default monthly tokens")}
              value={draft.monthly_tokens}
              onChange={(value) => change("monthly_tokens", value)}
            />
          </div>
        )}
      </GatewayForm>
    </section>
  );
}

function ModelSettings({
  model,
  modelBase,
  warning,
  revision,
  save,
}: {
  model: HostingModelPolicy;
  modelBase: string;
  warning?: string;
  revision: number;
  save: Save;
}) {
  const { t } = useI18n();
  return (
    <details className="min-w-0 border-t border-hairline py-3">
      <summary className="cursor-pointer text-sm text-ink">
        <span className="mr-2 break-all font-mono">{model.id}</span>
        <Badge tone={model.enabled ? "success" : "warning"}>
          {t(model.enabled ? "Enabled" : "Disabled")}
        </Badge>
      </summary>
      {warning ? (
        <p role="status" className="mt-2 text-xs text-warning">
          {warning === "base_policy_changed"
            ? t(
                "Server model configuration changed. The previous policy was disabled. Review the provider, model, safety settings and prices, then enable and save this model to approve its current configuration.",
              )
            : t("Model policy requires review: {warning}", { warning })}
        </p>
      ) : null}
      <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="text-xs leading-5 text-ink-muted">
          <p>{t("Provider: {provider}", { provider: model.provider })}</p>
          <p className="break-all">
            {t("Upstream model: {model}", { model: model.upstream_model })}
          </p>
          <p>
            {t("Policy version: {version}", {
              version: model.policy_version || t("Unversioned"),
            })}
          </p>
          <p className="mt-2 text-ink-tertiary">
            {t(
              "Prices are the accounting rates per million tokens. Keep them aligned with your provider pricing.",
            )}
          </p>
        </div>
        <GatewayForm
          label={t("Model {id}", { id: model.id })}
          revision={revision}
          values={{
            expected_model_base: modelBase,
            enabled: model.enabled,
            moderation: model.moderation,
            max_output_tokens: String(model.max_output_tokens),
            input: microusdToDollars(model.input_microusd_per_million),
            output: microusdToDollars(model.output_microusd_per_million),
          }}
          buildChange={(draft) => ({
            action: "model",
            target_id: model.id,
            expected_model_base: String(draft.expected_model_base),
            enabled: Boolean(draft.enabled),
            moderation: draft.moderation === "openai" ? "openai" : "off",
            max_output_tokens: tokens(draft, "max_output_tokens", 1),
            input_microusd_per_million: dollars(draft, "input"),
            output_microusd_per_million: dollars(draft, "output"),
          })}
          save={save}
        >
          {(draft, change, pending) => (
            <>
              <SettingsToggle
                label={t("Enable model")}
                ariaLabel={t("Enable {id}", { id: model.id })}
                checked={Boolean(draft.enabled)}
                disabled={pending}
                onChange={(value) => change("enabled", value)}
              />
              <label className="grid min-w-0 gap-1 text-xs text-ink-muted">
                {t("Safety policy for {model}", { model: model.id })}
                <select
                  className={gatewayInputClass}
                  value={String(draft.moderation)}
                  onChange={(event) => change("moderation", event.target.value)}
                >
                  <option value="openai">
                    {t("OpenAI moderation required")}
                  </option>
                  <option value="off">
                    {t("Off — skip moderation for this model")}
                  </option>
                </select>
              </label>
              {draft.moderation === "off" ? (
                <p className="text-xs text-warning">
                  {t("Requests to this model skip the OpenAI safety check.")}
                </p>
              ) : null}
              <div className="grid min-w-0 gap-3 sm:grid-cols-3">
                <GatewayField
                  numeric
                  label={t("Max output tokens for {id}", { id: model.id })}
                  value={draft.max_output_tokens}
                  onChange={(value) => change("max_output_tokens", value)}
                />
                <GatewayField
                  label={t("Input USD / million for {id}", { id: model.id })}
                  value={draft.input}
                  onChange={(value) => change("input", value)}
                />
                <GatewayField
                  label={t("Output USD / million for {id}", { id: model.id })}
                  value={draft.output}
                  onChange={(value) => change("output", value)}
                />
              </div>
            </>
          )}
        </GatewayForm>
      </div>
    </details>
  );
}

function UserSettings({
  user,
  revision,
  save,
}: {
  user: HostingAdminUser;
  revision: number;
  save: Save;
}) {
  const { t } = useI18n();
  const reset = formatHostingBudgetReset(
    user.quota.period_start,
    user.quota.resets_at,
  );
  return (
    <details className="min-w-0 border-t border-hairline py-3">
      <summary className="cursor-pointer text-sm text-ink">
        <span className="mr-2 break-all">
          {user.email || user.name || user.user_id}
        </span>
        {user.access_paused ? (
          <Badge tone="warning">{t("Access paused")}</Badge>
        ) : null}
      </summary>
      <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="min-w-0 text-xs leading-5 text-ink-muted">
          <MonoId>{user.user_id}</MonoId>
          <MonoId>{user.environment_id}</MonoId>
          <p className="mt-2">
            {t("Spent {spent} · reserved {reserved}", {
              spent: money(user.quota.spent_microusd),
              reserved: money(user.quota.reserved_microusd),
            })}
          </p>
          <p>
            {t("Remaining {remaining} · {tokens} tokens", {
              remaining: money(user.quota.remaining_microusd),
              tokens: number(user.quota.remaining_tokens),
            })}
          </p>
          <p>
            {t("Tokens: {spent} spent · {reserved} reserved", {
              spent: number(user.quota.spent_tokens),
              reserved: number(user.quota.reserved_tokens),
            })}
          </p>
          <p className="mt-1 text-ink-tertiary">
            {reset
              ? t("Resets {date} (UTC)", { date: reset })
              : t("Reset date unavailable")}
          </p>
        </div>
        <GatewayForm
          label={t("User {id}", { id: user.user_id })}
          revision={revision}
          values={{
            monthly_microusd: microusdToDollars(user.monthly_microusd),
            monthly_tokens: String(user.monthly_tokens),
            access_paused: user.access_paused,
          }}
          buildChange={(draft, baseline) => ({
            action: "user",
            target_id: user.user_id,
            ...(dollars(draft, "monthly_microusd") !==
            dollars(baseline, "monthly_microusd")
              ? { monthly_microusd: dollars(draft, "monthly_microusd") }
              : {}),
            ...(tokens(draft, "monthly_tokens") !==
            tokens(baseline, "monthly_tokens")
              ? { monthly_tokens: tokens(draft, "monthly_tokens") }
              : {}),
            ...(draft.access_paused !== baseline.access_paused
              ? { access_paused: Boolean(draft.access_paused) }
              : {}),
          })}
          save={save}
        >
          {(draft, change, pending) => (
            <>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <GatewayField
                  label={t("Monthly budget (USD) for {id}", {
                    id: user.user_id,
                  })}
                  value={draft.monthly_microusd}
                  onChange={(value) => change("monthly_microusd", value)}
                />
                <GatewayField
                  numeric
                  label={t("Monthly tokens for {id}", { id: user.user_id })}
                  value={draft.monthly_tokens}
                  onChange={(value) => change("monthly_tokens", value)}
                />
              </div>
              <SettingsToggle
                label={t("Pause free model access")}
                ariaLabel={t("Pause free access for {id}", {
                  id: user.user_id,
                })}
                checked={Boolean(draft.access_paused)}
                disabled={pending}
                onChange={(value) => change("access_paused", value)}
              />
            </>
          )}
        </GatewayForm>
      </div>
    </details>
  );
}

function RequestList({
  requests,
}: {
  requests: HostingAdminSnapshot["requests"];
}) {
  const { t } = useI18n();
  const unique = [
    ...new Map(requests.map((request) => [request.id, request])).values(),
  ];
  if (!unique.length) return <Empty>{t("No matching model requests.")}</Empty>;
  return (
    <div className="mt-3 min-w-0 overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-xs">
        <caption className="sr-only">{t("Free model request ledger")}</caption>
        <thead className="border-y border-hairline text-ink-tertiary">
          <tr>
            {[
              "Time / request",
              "User",
              "Model / provider",
              "Status / safety",
              "Spent / reserved",
              "Tokens in / out",
            ].map((label) => (
              <th key={label} scope="col" className="px-2 py-2 font-medium">
                {t(label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {unique.map((request) => (
            <tr key={request.id} className="align-top text-ink-muted">
              <td className="max-w-48 px-2 py-3">
                <time dateTime={request.created_at}>
                  {formatTime(request.created_at, t)}
                </time>
                <MonoId>{request.request_id}</MonoId>
                {request.upstream_request_id ? (
                  <MonoId tooltip={t("Upstream request ID")}>
                    {request.upstream_request_id}
                  </MonoId>
                ) : null}
              </td>
              <td className="max-w-40 px-2 py-3">
                <MonoId>{request.user_id}</MonoId>
                <MonoId>{request.environment_id}</MonoId>
              </td>
              <td className="max-w-56 px-2 py-3">
                <span className="block break-all text-ink">
                  {request.model || t("Unresolved")}
                </span>
                <span className="block break-all">
                  {request.provider} / {request.upstream_model}
                </span>
              </td>
              <td className="max-w-48 px-2 py-3">
                <Badge
                  tone={
                    ["reserved", "settled"].includes(request.status)
                      ? "neutral"
                      : "warning"
                  }
                >
                  {request.status}
                </Badge>
                <p className="mt-1">
                  {t("Safety: {verdict}", {
                    verdict: request.moderation_verdict || t("Pending"),
                  })}
                </p>
                {request.error_code ? (
                  <p className="mt-1 break-all text-warning">
                    {request.error_code}
                  </p>
                ) : null}
                <p className="mt-1 text-ink-tertiary">
                  {request.generation_started
                    ? "Generation started"
                    : "Generation not started"}
                </p>
              </td>
              <td className="whitespace-nowrap px-2 py-3 font-mono">
                {money(request.spent_microusd)}
                <span className="mt-1 block text-ink-tertiary">
                  {t("{amount} held", {
                    amount: money(request.reserved_microusd),
                  })}
                </span>
              </td>
              <td className="whitespace-nowrap px-2 py-3 font-mono">
                {number(request.input_tokens)} / {number(request.output_tokens)}
                <span className="mt-1 block text-ink-tertiary">
                  {t("{tokens} total", { tokens: number(request.tokens) })}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pagination({
  label,
  hasCursor,
  next,
  onFirst,
  onNext,
}: {
  label: string;
  hasCursor: boolean;
  next?: string;
  onFirst: () => void;
  onNext: (cursor: string) => void;
}) {
  const { t } = useI18n();
  if (!hasCursor && !next) return null;
  return (
    <div
      aria-label={t("{kind} pagination", { kind: t(label) })}
      className="mt-3 flex gap-2"
    >
      <Button size="sm" onClick={onFirst} disabled={!hasCursor}>
        {t("First {kind}", { kind: t(label) })}
      </Button>
      <Button size="sm" onClick={() => next && onNext(next)} disabled={!next}>
        {t("Next {kind}", { kind: t(label) })}
      </Button>
    </div>
  );
}

function formatTime(value: string, t: Translator) {
  const time = new Date(value);
  return Number.isFinite(time.getTime()) && time.getUTCFullYear() > 1
    ? `${time.toISOString().replace("T", " ").slice(0, 19)} UTC`
    : t("Time unavailable");
}
