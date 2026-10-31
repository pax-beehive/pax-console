"use client";

import { useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { ConsoleLayout } from "@/components/shell/console-layout";
import {
  SettingsBack,
  SettingsPageHeader,
} from "@/components/settings/settings-navigation";
import { settingsSection } from "@/components/settings/settings-catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MonoId } from "@/components/ui/text";
import { Switch } from "@/components/ui/switch";
import { useAgents } from "@/features/api/resources";
import { Agent, User } from "@/features/api/types";
import { ApiError, AuthError } from "@/features/api/errors";
import {
  SecretarySettings,
  SecretaryState,
  UpdateSecretarySettings,
  useRunSecretaryNow,
  useSecretarySettings,
  useUpdateSecretarySettings,
} from "@/features/api/secretary";
import { useSecretaryProgress } from "@/features/api/secretary-progress";
import {
  SecretaryProgressOverview,
  SecretarySessionProgressList,
} from "./secretary-progress";

const stateLabels: Record<SecretaryState, string> = {
  disabled: "Off",
  idle: "Ready",
  waiting_for_agent: "Waiting for agent",
  processing: "Processing",
  error: "Needs attention",
};

export function SecretarySettingsPage({ user }: { user: User }) {
  return (
    <ConsoleLayout user={user}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <SettingsPageHeader
          title="Secretary"
          category="Workspace"
          description={settingsSection("secretary").description}
          mobileHeading={
            <>
              <SettingsBack />
              <h1 className="text-xl font-semibold">Secretary</h1>
              <p className="mt-2 text-sm text-ink-tertiary">
                Keep summaries connected to your conversations.
              </p>
            </>
          }
        />
        <SecretarySettingsPanel userId={user.user_id} />
      </div>
    </ConsoleLayout>
  );
}

export function SecretarySettingsPanel({ userId }: { userId: string }) {
  const settings = useSecretarySettings(userId);
  const agents = useAgents(userId, "owned");
  const save = useUpdateSecretarySettings(userId);
  const run = useRunSecretaryNow(userId);
  const progress = useSecretaryProgress(userId);
  const ownedAgents = (agents.data?.agents ?? []).filter(
    (agent) => !agent.owner_user_id || agent.owner_user_id === userId,
  );

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-auto p-4 sm:p-5 lg:px-8">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <p className="text-sm leading-6 text-ink-muted">
          Choose one of your agents to read your workspace conversations and
          maintain summaries automatically. Enabling Secretary allows that agent
          to run in the background.
        </p>
        {settings.isPending ? (
          <p className="text-sm text-ink-tertiary" role="status">
            Loading Secretary settings…
          </p>
        ) : settings.isError || !settings.data ? (
          <div className="rounded-md border border-warning/30 p-4" role="alert">
            <p className="text-sm text-ink-muted">
              {settings.error instanceof AuthError
                ? "Your session expired. Reload this page to sign in."
                : "Secretary is unavailable right now. Your settings have not changed."}
            </p>
            <Button
              className="mt-3"
              onClick={() => {
                void settings.refetch();
              }}
              size="sm"
            >
              Retry settings
            </Button>
          </div>
        ) : (
          <>
            <SecretaryStatus settings={settings.data} />
            <SecretaryProgressOverview progress={progress} />
            {save.isError && (
              <Notice>
                {save.error instanceof ApiError && save.error.status === 409
                  ? "Settings changed in another window. Review the latest settings before saving again."
                  : save.error instanceof ApiError && save.error.status === 403
                    ? "Choose an agent you own. Your saved settings have not changed."
                    : "Could not confirm your changes. Check the current status and try again."}
              </Notice>
            )}
            {save.isSuccess && (
              <p className="text-xs text-success" role="status">
                Settings saved.
              </p>
            )}
            <SecretaryForm
              key={`${userId}:${settings.data.revision}:${settings.data.agent_id}:${settings.data.enabled}`}
              agents={ownedAgents}
              agentsLoading={agents.isPending}
              agentsError={agents.isError}
              onRetryAgents={() => {
                void agents.refetch();
              }}
              settings={settings.data}
              pending={save.isPending}
              onSave={(input) => {
                run.reset();
                save.mutate(input);
              }}
            />
            {settings.data.enabled && (
              <section className="border-t border-hairline pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="max-w-md text-xs leading-5 text-ink-tertiary">
                    Secretary checks for new and changed conversations
                    automatically. You can also request a run now.
                  </p>
                  <Button
                    disabled={
                      !settings.data.agent_available ||
                      settings.data.state === "processing" ||
                      run.isPending ||
                      save.isPending
                    }
                    icon={
                      <RefreshCw
                        aria-hidden="true"
                        className={`h-3.5 w-3.5 ${run.isPending ? "animate-spin" : ""}`}
                      />
                    }
                    onClick={() => {
                      save.reset();
                      run.mutate();
                    }}
                    size="sm"
                  >
                    {run.isPending
                      ? "Requesting…"
                      : settings.data.state === "error"
                        ? "Retry run"
                        : "Run now"}
                  </Button>
                </div>
                {!settings.data.agent_available && (
                  <p className="mt-2 text-xs text-ink-tertiary">
                    A run will wait until the selected agent reconnects.
                  </p>
                )}
                {run.isError && (
                  <Notice>
                    Could not confirm the run request. Refresh settings before
                    trying again.
                  </Notice>
                )}
                {run.isSuccess && (
                  <p className="mt-2 text-xs text-success" role="status">
                    Run requested.
                  </p>
                )}
              </section>
            )}
            <SecretarySessionProgressList
              progress={progress}
              agents={ownedAgents}
            />
          </>
        )}
      </div>
    </div>
  );
}

function SecretaryForm({
  settings,
  agents,
  agentsLoading,
  agentsError,
  onRetryAgents,
  pending,
  onSave,
}: {
  settings: SecretarySettings;
  agents: Agent[];
  agentsLoading: boolean;
  agentsError: boolean;
  onRetryAgents: () => void;
  pending: boolean;
  onSave: (input: UpdateSecretarySettings) => void;
}) {
  const [agentId, setAgentId] = useState(settings.agent_id ?? "");
  const [enabled, setEnabled] = useState(settings.enabled);
  const selected = agents.find((agent) => agent.agent_id === agentId);
  const unknownAgent = Boolean(
    agentId && !selected && !agentsLoading && !agentsError,
  );
  const dirty =
    agentId !== (settings.agent_id ?? "") || enabled !== settings.enabled;
  const canEnable = Boolean(selected && !agentsLoading && !agentsError);
  const invalidEnabled = enabled && !canEnable;

  return (
    <form
      aria-label="Secretary settings"
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!dirty || pending || invalidEnabled) return;
        onSave({
          agent_id:
            enabled || (selected && !agentsLoading && !agentsError)
              ? agentId
              : "",
          enabled,
          expected_revision: settings.revision,
        });
      }}
    >
      <div>
        <label
          className="text-xs font-medium text-ink-subtle"
          htmlFor="secretary-agent"
        >
          Secretary agent
        </label>
        <div className="relative mt-2">
          <select
            id="secretary-agent"
            className="min-h-10 w-full min-w-0 appearance-none rounded-md border border-hairline bg-surface-1 px-3 py-2 pr-9 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:text-ink-tertiary"
            disabled={agentsLoading || agentsError || pending}
            onChange={(event) => {
              setAgentId(event.target.value);
              if (!event.target.value) setEnabled(false);
            }}
            value={agentId}
          >
            <option value="">Select an agent</option>
            {unknownAgent && (
              <option disabled value={agentId}>
                Unavailable agent
              </option>
            )}
            {agents.map((agent) => (
              <option key={agent.agent_id} value={agent.agent_id}>
                {agent.name || agent.agent_id}
                {agent.online === false ? " — Offline" : ""}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-ink-tertiary"
          />
        </div>
        {selected && (
          <div className="mt-2">
            <MonoId>{selected.agent_id}</MonoId>
          </div>
        )}
        {agentsLoading ? (
          <p className="mt-2 text-xs text-ink-tertiary" role="status">
            Loading your agents…
          </p>
        ) : agentsError ? (
          <div className="mt-2" role="alert">
            <p className="text-xs text-warning">
              Could not load your agents. You can still turn Secretary off.
            </p>
            <Button
              className="mt-2"
              onClick={onRetryAgents}
              size="sm"
              type="button"
            >
              Retry agents
            </Button>
          </div>
        ) : unknownAgent ? (
          <p className="mt-2 text-xs text-warning">
            The saved agent is no longer available. Choose another agent or turn
            Secretary off.
          </p>
        ) : !agents.length ? (
          <p className="mt-2 text-xs text-ink-tertiary">
            You do not have an agent yet. Connect an agent in Settings →
            Devices.
          </p>
        ) : selected?.online === false ? (
          <p className="mt-2 text-xs text-ink-tertiary">
            This agent is offline. You can save your settings; work will wait
            for it to reconnect.
          </p>
        ) : (
          <p className="mt-2 text-xs text-ink-tertiary">
            Only agents you own can be selected.
          </p>
        )}
      </div>
      <div className="flex items-start justify-between gap-4 border-t border-hairline pt-4">
        <div>
          <label
            className="text-sm font-medium text-ink"
            htmlFor="secretary-enabled"
          >
            Automatic summaries
          </label>
          <p className="mt-1 text-xs leading-5 text-ink-tertiary">
            Keep your summaries updated as conversations change.
          </p>
        </div>
        <Switch
          id="secretary-enabled"
          aria-label="Automatic summaries"
          checked={enabled}
          className="mt-0.5"
          disabled={pending || (!enabled && !canEnable)}
          onCheckedChange={setEnabled}
        />
      </div>
      {invalidEnabled && (
        <p className="text-xs text-warning">
          Select an agent you own before saving enabled settings.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={!dirty || invalidEnabled || pending}
          type="submit"
          variant="primary"
        >
          {pending ? "Saving…" : "Save settings"}
        </Button>
        <p className="text-xs text-ink-tertiary">
          {dirty ? "Unsaved changes" : "Changes take effect after saving."}
        </p>
      </div>
    </form>
  );
}

function SecretaryStatus({ settings }: { settings: SecretarySettings }) {
  const date = settings.last_completed_at
    ? new Date(settings.last_completed_at)
    : undefined;
  return (
    <section
      aria-label="Secretary status"
      className="rounded-md border border-hairline bg-surface-1 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-medium text-ink-subtle">Current status</h2>
        <Badge
          tone={
            settings.state === "error"
              ? "warning"
              : settings.state === "processing"
                ? "accent"
                : "neutral"
          }
        >
          {stateLabels[settings.state] || "Unknown"}
        </Badge>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2 text-xs">
        <dt className="text-ink-tertiary">Queued</dt>
        <dd className="text-ink-muted">
          {settings.pending_count}{" "}
          {settings.pending_count === 1 ? "conversation" : "conversations"}
        </dd>
        <dt className="text-ink-tertiary">Last completed</dt>
        <dd className="text-ink-muted">
          {date && !Number.isNaN(date.getTime())
            ? date.toLocaleString()
            : "No completed runs yet"}
        </dd>
      </dl>
      {settings.last_error && (
        <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-warning [overflow-wrap:anywhere]">
          {settings.last_error.slice(0, 400)}
        </p>
      )}
    </section>
  );
}

function Notice({ children }: { children: string }) {
  return (
    <div
      className="rounded-md border border-warning/30 p-3 text-xs leading-5 text-warning"
      role="alert"
    >
      {children}
    </div>
  );
}
