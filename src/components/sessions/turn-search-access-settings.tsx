"use client";

import { useI18n } from "@/features/i18n/use-i18n";

import { useId, useState } from "react";
import type { TurnSearchAccess } from "@/features/api/types";
import { parseTurnSearchAccess } from "@/features/permissions/turn-search-access";
import { Button } from "@/components/ui/button";
import { SettingsRow, SettingsToggle } from "@/components/ui/settings-controls";
import { useSessionSettings } from "./session-settings";

type Props = {
  autoApprove?: boolean;
  disabled?: boolean;
  onChange: (access: TurnSearchAccess | undefined) => void;
  value?: TurnSearchAccess;
};

export function TurnSearchAccessSettings(props: Props) {
  const { t } = useI18n();
  const settings = useSessionSettings();
  if (!settings) return null;
  if (settings.page.id === "home") {
    return (
      <SettingsRow
        label={t("Expand search scope")}
        value={
          props.disabled
            ? t("Unavailable")
            : props.value
              ? t("Next turn")
              : props.autoApprove
                ? t("Auto expansion")
                : t("Own agent")
        }
        disabled={props.disabled}
        tooltip={
          props.disabled
            ? t("Search scope expansion is unavailable in encrypted sessions.")
            : undefined
        }
        onClick={() =>
          settings.navigate({
            id: "turn-search",
            title: t("Expand search scope"),
          })
        }
      />
    );
  }
  if (settings.page.id !== "turn-search") return null;
  return <SearchAccessEditor {...props} onDone={settings.finish} />;
}

function SearchAccessEditor({
  autoApprove,
  disabled,
  value,
  onChange,
  onDone,
}: Props & { onDone: () => void }) {
  const { t } = useI18n();
  const id = useId();
  const [enabled, setEnabled] = useState(Boolean(value));
  const [queries, setQueries] = useState(value?.queries.join("\n") ?? "*");
  const [agents, setAgents] = useState(value?.agent_ids?.join("\n") ?? "*");
  const [sessions, setSessions] = useState(
    value?.session_ids.join("\n") ?? "*",
  );
  const [error, setError] = useState("");
  const inputClass =
    "mt-2 min-h-20 w-full resize-y rounded-lg border border-hairline bg-surface-1 px-3 py-2 text-sm text-ink outline-none focus:border-primary-focus";
  return (
    <div className="grid gap-4">
      <p className="px-3 text-sm leading-6 text-ink-muted">
        {t(
          "Agents can search their own sessions by default. Preauthorize a wider scope for the next prompt. Extra access ends when that turn finishes or is stopped.",
        )}
      </p>
      {autoApprove && (
        <p className="px-3 text-sm leading-6 text-ink-muted">
          {t(
            "Without preauthorization, search stays within the calling agent. PAX auto approve approves expansion requests when the agent asks.",
          )}
        </p>
      )}
      <SettingsToggle
        label={t("Expand scope for next turn")}
        checked={enabled}
        disabled={disabled}
        onChange={setEnabled}
      />
      {enabled && (
        <div className="grid gap-4 px-3">
          <p className="text-xs leading-5 text-ink-muted">
            {t(
              "These limits apply to extra access. The calling agent can still search its own sessions.",
            )}
          </p>
          <label className="text-sm text-ink" htmlFor={`${id}-queries`}>
            {t("Allowed queries")}
            <textarea
              id={`${id}-queries`}
              aria-label={t("Allowed queries")}
              className={inputClass}
              value={queries}
              disabled={disabled}
              onChange={(event) => setQueries(event.target.value)}
            />
            <span className="mt-1 block text-xs leading-5 text-ink-muted">
              {t("One complete query per line. Use * to allow any query.")}
            </span>
          </label>
          <label className="text-sm text-ink" htmlFor={`${id}-agents`}>
            {t("Agents")}
            <textarea
              id={`${id}-agents`}
              aria-label={t("Agents")}
              className={inputClass}
              value={agents}
              disabled={disabled}
              onChange={(event) => setAgents(event.target.value)}
            />
            <span className="mt-1 block text-xs leading-5 text-ink-muted">
              {t(
                "Use * for all your agents, self for the calling agent, or one agent ID per line.",
              )}
            </span>
          </label>
          <label className="text-sm text-ink" htmlFor={`${id}-sessions`}>
            {t("Sessions")}
            <textarea
              id={`${id}-sessions`}
              aria-label={t("Sessions")}
              className={inputClass}
              value={sessions}
              disabled={disabled}
              onChange={(event) => setSessions(event.target.value)}
            />
            <span className="mt-1 block text-xs leading-5 text-ink-muted">
              {t(
                "One session ID per line. Use * for all sessions of the selected agents.",
              )}
            </span>
          </label>
        </div>
      )}
      {error && (
        <p role="alert" className="px-3 text-sm text-warning">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 px-3 pb-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("Cancel")}
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={disabled}
          onClick={() => {
            try {
              onChange(
                enabled
                  ? parseTurnSearchAccess(queries, sessions, agents)
                  : undefined,
              );
              onDone();
            } catch (caught) {
              setError(
                caught instanceof Error
                  ? caught.message
                  : t("Invalid search scope."),
              );
            }
          }}
        >
          {t("Apply for next turn")}
        </Button>
      </div>
    </div>
  );
}
