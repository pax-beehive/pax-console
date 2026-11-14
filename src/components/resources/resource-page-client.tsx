"use client";

import { useI18n, type Translator } from "@/features/i18n/use-i18n";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  KeyRound,
  Plus,
  Radio,
  Settings2,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MonoId, TruncatedText } from "@/components/ui/text";
import {
  createApiKey,
  createNodeRegistrationToken,
  decideApproval,
  deleteApiKey,
  listAgentSessions,
  revokeApprovalGrant,
  useAgents,
  useApiKeys,
  useApprovalGrants,
  useApprovals,
  useHealth,
  useNodes,
} from "@/features/api/resources";
import { queryKeys } from "@/features/api/query-keys";
import { selectVisibleSessions } from "@/features/sessions/session-origin";
import { Agent, AgentApproval, Node, User } from "@/features/api/types";
import { compactId } from "@/lib/format";
import {
  deleteRootKey,
  loadRootKey,
  saveRootKey,
} from "@/features/e2ee/root-key-store";
import { generateEncodedRootKey } from "@/features/e2ee/envelope";
import {
  agentLabel,
  buildSessionRows,
  byCreatedAtDesc,
  byLastActiveDesc,
  isActiveSession,
  isDeviceNode,
  nodeLabel,
  paginateItems,
  sessionUpdatedAt,
  SessionRow,
} from "./resource-models";
import { ServiceStatusPanel } from "@/components/settings/service-status-panel";
import {
  SettingsBack,
  SettingsPageHeader,
  settingsLinks,
} from "@/components/settings/settings-navigation";
import { settingsSection } from "@/components/settings/settings-catalog";

type ResourceKind =
  | "sessions"
  | "approvals"
  | "security"
  | "grants"
  | "encryption"
  | "monitor"
  | "api-keys"
  | "node-registration";

type ResourcePageClientProps = {
  kind: ResourceKind;
  user: User;
};

const copy: Record<
  ResourceKind,
  { title: string; eyebrow: string; icon: ReactNode }
> = {
  sessions: {
    title: "Sessions",
    eyebrow: "recent work",
    icon: <TerminalSquare className="h-4 w-4" />,
  },
  approvals: {
    title: "Approvals",
    eyebrow: "human decisions",
    icon: <ShieldCheck className="h-4 w-4" />,
  },
  security: {
    title: "Security",
    eyebrow: "persistent agent grants",
    icon: <ShieldCheck className="h-4 w-4" />,
  },
  grants: {
    title: "Allowed actions",
    eyebrow: "permissions previously given to agents",
    icon: <ShieldCheck className="h-4 w-4" />,
  },
  encryption: {
    title: "Encrypted chats",
    eyebrow: "device access and encryption keys",
    icon: <ShieldCheck className="h-4 w-4" />,
  },
  monitor: {
    title: "Service status",
    eyebrow: "service and resource connections",
    icon: <Radio className="h-4 w-4" />,
  },
  "api-keys": {
    title: "API keys",
    eyebrow: "access management",
    icon: <KeyRound className="h-4 w-4" />,
  },
  "node-registration": {
    title: "Manual device registration",
    eyebrow: "bootstrap access",
    icon: <Settings2 className="h-4 w-4" />,
  },
};

const resourceSettingsSections: Partial<Record<ResourceKind, string>> = {
  security: "permissions",
  grants: "permissions",
  encryption: "encryption",
  monitor: "status",
  "api-keys": "apiKeys",
  "node-registration": "registration",
};

const emptyNodes: Node[] = [];
const emptyAgents: Agent[] = [];
const sessionPageSize = 50;

export function ResourcePageClient({ kind, user }: ResourcePageClientProps) {
  const { t } = useI18n();
  const [showAllResources, setShowAllResources] = useState(false);
  const [sessionPage, setSessionPage] = useState(1);
  const usesFleet = ["sessions", "monitor", "security", "encryption"].includes(
    kind,
  );
  const nodesQuery = useNodes(usesFleet ? user.user_id : undefined);
  const agentsQuery = useAgents(
    usesFleet ? user.user_id : undefined,
    kind === "security" || kind === "encryption" ? "owned" : "accessible",
    kind === "monitor" ? 30_000 : undefined,
  );
  const allNodes = nodesQuery.data?.nodes ?? emptyNodes;
  const sortedNodes = useMemo(
    () =>
      byCreatedAtDesc(allNodes.filter(isDeviceNode), (node) => node.node_id),
    [allNodes],
  );
  const allAgents = agentsQuery.data?.agents ?? emptyAgents;
  const sortedAgents = useMemo(
    () => byCreatedAtDesc(allAgents, (agent) => agent.agent_id),
    [allAgents],
  );
  const agentsLoading = agentsQuery.isLoading;
  const sessionQueries = useQueries({
    queries: sortedAgents.map((agent) => {
      const nodeId = agent.node_id;
      return {
        queryKey: queryKeys.sessions(
          user.user_id,
          nodeId ?? "unassigned",
          agent.agent_id,
        ),
        queryFn: () =>
          nodeId
            ? listAgentSessions(user.user_id, nodeId, agent.agent_id)
            : Promise.resolve({ sessions: [] }),
        select: selectVisibleSessions,
        enabled:
          Boolean(user.user_id && nodeId && agent.agent_id) &&
          (kind === "sessions" || kind === "monitor"),
      };
    }),
  });
  const allSessions = sessionQueries.flatMap(
    (query) => query.data?.sessions ?? [],
  );
  const sortedSessionRows = useMemo(
    () =>
      byLastActiveDesc(
        buildSessionRows(allSessions, sortedAgents, sortedNodes),
        sessionUpdatedAt,
        (session) => session.name ?? session.session_id,
      ),
    [allSessions, sortedAgents, sortedNodes],
  );
  const sessionRows = useMemo(
    () =>
      showAllResources
        ? sortedSessionRows
        : sortedSessionRows.filter((session) => isActiveSession(session)),
    [showAllResources, sortedSessionRows],
  );
  const paginatedSessions = useMemo(
    () => paginateItems(sessionRows, sessionPage, sessionPageSize),
    [sessionPage, sessionRows],
  );
  const sessionsLoading =
    agentsLoading || sessionQueries.some((query) => query.isLoading);
  const healthQuery = useHealth(kind === "monitor");
  const apiKeysQuery = useApiKeys(
    kind === "api-keys" ? user.user_id : undefined,
  );
  const approvalsQuery = useApprovals(
    kind === "approvals" ? user.user_id : undefined,
  );
  const approvalGrantsQuery = useApprovalGrants(
    kind === "approvals" || kind === "security" || kind === "grants"
      ? user.user_id
      : undefined,
  );
  const meta = copy[kind];
  const sectionId = resourceSettingsSections[kind];
  // Only the advanced directory's own pages return to it on narrow screens.
  const advancedSettings = ["api-keys", "node-registration"].includes(kind);
  const description = sectionId
    ? settingsSection(sectionId).description
    : meta.eyebrow;
  const apiError =
    nodesQuery.error ??
    agentsQuery.error ??
    firstQueryError(sessionQueries) ??
    healthQuery.error ??
    apiKeysQuery.error ??
    approvalsQuery.error ??
    approvalGrantsQuery.error ??
    null;

  function handleShowAllResourcesChange(checked: boolean) {
    setShowAllResources(checked);
    setSessionPage(1);
  }

  return (
    <ConsoleLayout user={user}>
      <div className="flex min-h-0 flex-1 flex-col">
        <SettingsPageHeader
          title={t(meta.title)}
          description={t(description)}
          mobileHeading={
            <>
              <SettingsBack
                href={
                  advancedSettings ? settingsLinks.advanced : settingsLinks.home
                }
                label={
                  advancedSettings ? t("Advanced settings") : t("Settings")
                }
              />
              <div className="flex items-center gap-2 text-xs text-ink-tertiary">
                {meta.icon}
                {t(meta.eyebrow)}
              </div>
              <h1 className="mt-2 text-2xl font-semibold">{t(meta.title)}</h1>
            </>
          }
          category={t(
            sectionId ? settingsSection(sectionId).category : meta.eyebrow,
          )}
        >
          <div className="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            {supportsActiveFilter(kind) && (
              <ActiveFilterToggle
                checked={showAllResources}
                onChange={handleShowAllResourcesChange}
              />
            )}
          </div>
        </SettingsPageHeader>

        {apiError && (
          <div className="px-5 pt-4">
            <ApiNotice error={apiError} />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5 lg:px-8 lg:py-6">
          <div className="mx-auto w-full max-w-5xl">
            {kind === "sessions" && (
              <SessionGrid
                filteredCount={sessionRows.length}
                isLoading={sessionsLoading}
                onPageChange={setSessionPage}
                page={paginatedSessions.currentPage}
                pageCount={paginatedSessions.pageCount}
                pageEnd={paginatedSessions.endIndex}
                pageStart={paginatedSessions.startIndex}
                sessions={paginatedSessions.items}
                totalCount={sortedSessionRows.length}
              />
            )}
            {(kind === "approvals" ||
              kind === "security" ||
              kind === "grants" ||
              kind === "encryption") && (
              <div className="grid gap-4">
                {(kind === "security" || kind === "encryption") && (
                  <E2EEKeysPanel agents={sortedAgents} nodes={sortedNodes} />
                )}
                {kind !== "encryption" && (
                  <ApprovalsPanel
                    approvals={approvalsQuery.data?.approvals ?? []}
                    grants={approvalGrantsQuery.data?.grants ?? []}
                    isLoading={
                      approvalsQuery.isLoading || approvalGrantsQuery.isLoading
                    }
                    showPending={kind === "approvals"}
                    userId={user.user_id}
                  />
                )}
              </div>
            )}
            {kind === "monitor" && (
              <ServiceStatusPanel
                nodes={nodesQuery.data?.nodes}
                agents={agentsQuery.data?.agents}
                health={healthQuery.data}
                loading={
                  nodesQuery.isLoading ||
                  agentsQuery.isLoading ||
                  healthQuery.isLoading
                }
                error={Boolean(
                  nodesQuery.error || agentsQuery.error || healthQuery.error,
                )}
                recentSessions={
                  agentsQuery.error ||
                  sessionsLoading ||
                  firstQueryError(sessionQueries)
                    ? undefined
                    : allSessions.length
                }
                refreshing={
                  nodesQuery.isFetching ||
                  agentsQuery.isFetching ||
                  healthQuery.isFetching
                }
                refresh={() => {
                  void nodesQuery.refetch();
                  void agentsQuery.refetch();
                  void healthQuery.refetch();
                  sessionQueries.forEach((query) => {
                    void query.refetch();
                  });
                }}
              />
            )}
            {kind === "api-keys" && (
              <ApiKeysPanel
                apiKeys={apiKeysQuery.data?.api_keys ?? []}
                isLoading={apiKeysQuery.isLoading}
                userId={user.user_id}
              />
            )}
            {kind === "node-registration" && (
              <NodeRegistrationPanel userId={user.user_id} />
            )}
          </div>
        </div>
      </div>
    </ConsoleLayout>
  );
}

function SessionGrid({
  filteredCount,
  isLoading,
  onPageChange,
  page,
  pageCount,
  pageEnd,
  pageStart,
  sessions,
  totalCount,
}: {
  filteredCount: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  page: number;
  pageCount: number;
  pageEnd: number;
  pageStart: number;
  sessions: SessionRow[];
  totalCount: number;
}) {
  const { t } = useI18n();
  if (isLoading) {
    return <EmptyState label={t("Loading sessions")} />;
  }

  return (
    <div className="grid min-w-0 gap-3">
      {filteredCount > 0 && (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 text-sm text-ink-tertiary">
          <span className="min-w-0">
            {t("Showing")} {pageStart}-{pageEnd} {t("of")} {filteredCount}
          </span>
          <div className="flex items-center gap-2">
            <Button
              disabled={page <= 1}
              icon={<ChevronLeft className="h-4 w-4" />}
              onClick={() => onPageChange(page - 1)}
              size="icon"
              tooltip={t("Previous page")}
              type="button"
              variant="secondary"
            />
            <span className="min-w-16 text-center text-xs text-ink-muted">
              {page}/{pageCount}
            </span>
            <Button
              disabled={page >= pageCount}
              icon={<ChevronRight className="h-4 w-4" />}
              onClick={() => onPageChange(page + 1)}
              size="icon"
              tooltip={t("Next page")}
              type="button"
              variant="secondary"
            />
          </div>
        </div>
      )}
      <div className="grid min-w-0 overflow-hidden rounded-lg border border-hairline">
        {sessions.map((session) => (
          <Link
            className="grid min-w-0 gap-3 border-b border-hairline bg-surface-1 px-3 py-3 transition last:border-b-0 hover:bg-surface-2 lg:grid-cols-[minmax(0,1fr)_220px_120px]"
            href={`/sessions/${session.session_id}?nodeId=${session.node_id}&agentId=${session.agent_id}`}
            key={session.session_id}
          >
            <div className="min-w-0">
              <TruncatedText className="text-sm font-medium">
                {session.name ?? session.current_task ?? session.session_id}
              </TruncatedText>
              <TruncatedText className="mt-1 text-xs text-ink-muted">
                {session.preview ?? session.current_task ?? t("Open session")}
              </TruncatedText>
            </div>
            <div className="grid min-w-0 content-start gap-1">
              <div className="flex min-w-0 items-start gap-1.5">
                <Badge
                  className="min-w-0 max-w-none flex-1"
                  tone={session.agentActive ? "success" : "neutral"}
                  tooltip={session.agent_id}
                >
                  {t("Agent:")} {session.agentLabel}
                </Badge>
                <Badge
                  className="min-w-0 max-w-none flex-1"
                  tone={session.nodeActive ? "success" : "neutral"}
                  tooltip={session.node_id}
                >
                  {t("Node:")} {session.nodeLabel}
                </Badge>
              </div>
              <MonoId
                className="w-fit max-w-full rounded-md border border-hairline bg-canvas px-1.5 py-0.5"
                tooltip={session.session_id}
              >
                {compactId(session.session_id)}
              </MonoId>
            </div>
            <div className="flex items-start lg:justify-end">
              <Badge>{t(session.runtime_status ?? "unknown")}</Badge>
            </div>
          </Link>
        ))}
        {sessions.length === 0 && (
          <EmptyState
            label={totalCount > 0 ? t("No active sessions") : t("No sessions")}
          />
        )}
      </div>
    </div>
  );
}

function NodeRegistrationPanel({ userId }: { userId: string }) {
  const { t } = useI18n();
  const [ttl, setTtl] = useState(3600);
  const [copied, setCopied] = useState(false);
  const [createdToken, setCreatedToken] = useState<{
    expires_at?: string;
    token: string;
  } | null>(null);
  const createToken = useMutation({
    mutationFn: () => createNodeRegistrationToken(userId, ttl),
    onSuccess: (data) => {
      setCopied(false);
      setCreatedToken(data);
    },
  });

  const copyToken = async () => {
    if (!createdToken?.token || !navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(createdToken.token);
    setCopied(true);
  };

  return (
    <div className="grid gap-4">
      <section className="rounded-lg border border-hairline bg-surface-1 p-3">
        <div className="flex min-w-0 flex-wrap items-end gap-3">
          <label className="grid w-full gap-2 text-sm text-ink-muted sm:w-56">
            {t("TTL seconds")}{" "}
            <input
              className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 font-mono text-base text-ink sm:text-sm"
              inputMode="numeric"
              min={300}
              onChange={(event) => setTtl(Number(event.target.value))}
              step={300}
              type="number"
              value={ttl}
            />
            <div className="flex flex-wrap gap-2">
              {[
                { label: "1h", value: 3600 },
                { label: "24h", value: 86400 },
                { label: "7d", value: 604800 },
              ].map((preset) => (
                <Button
                  aria-pressed={ttl === preset.value}
                  className="min-w-14"
                  key={preset.value}
                  onClick={() => setTtl(preset.value)}
                  size="sm"
                  type="button"
                  variant={ttl === preset.value ? "secondary" : "ghost"}
                >
                  {t(preset.label)}
                </Button>
              ))}
            </div>
          </label>
          <Button
            className="w-full sm:max-w-40"
            disabled={createToken.isPending || ttl <= 0}
            icon={<Plus className="h-4 w-4" />}
            onClick={() => createToken.mutate()}
            tooltip={t("Create node registration token")}
            type="button"
            variant="primary"
          >
            {createToken.isPending ? t("Creating...") : t("Create token")}
          </Button>
        </div>
      </section>

      {createToken.error && <ApiNotice error={createToken.error} />}

      {createdToken && (
        <section className="rounded-lg border border-warning bg-surface-1 p-3">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink">
                {t("Copy this registration token now. It is one-time use.")}
              </div>
              <div className="mt-1 text-xs text-ink-tertiary">
                {t(
                  "The full token is shown below and wraps inside this panel.",
                )}
              </div>
            </div>
            <Button
              disabled={!createdToken.token}
              icon={
                copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )
              }
              onClick={() => void copyToken()}
              size="sm"
              tooltip={copied ? t("Copied token") : t("Copy token")}
              type="button"
              variant="ghost"
            >
              {copied ? t("Copied") : t("Copy")}
            </Button>
          </div>
          <div className="mt-3 min-w-0 max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-hairline bg-canvas p-3 font-mono text-xs leading-6 text-ink-muted">
            {createdToken.token}
          </div>
          <div className="mt-3 font-mono text-xs text-ink-tertiary">
            {t("expires:")} {createdToken.expires_at ?? t("unknown")}
          </div>
        </section>
      )}
    </div>
  );
}

function E2EEKeysPanel({ agents, nodes }: { agents: Agent[]; nodes: Node[] }) {
  const { t } = useI18n();
  const [agentId, setAgentId] = useState("");
  const [encodedKey, setEncodedKey] = useState("");
  const [configured, setConfigured] = useState(false);
  const [status, setStatus] = useState<{ message: string; local: boolean }>();
  const [busy, setBusy] = useState(false);

  const selectedAgentId = agents.some((agent) => agent.agent_id === agentId)
    ? agentId
    : (agents[0]?.agent_id ?? "");

  useEffect(() => {
    let active = true;
    if (!selectedAgentId) {
      return;
    }
    void loadRootKey(selectedAgentId)
      .then((key) => {
        if (active) {
          setConfigured(Boolean(key));
          setStatus(undefined);
        }
      })
      .catch((error) => {
        if (active) {
          setStatus({
            message: error instanceof Error ? error.message : String(error),
            local: false,
          });
        }
      });
    return () => {
      active = false;
    };
  }, [selectedAgentId]);

  async function handleSave() {
    setBusy(true);
    setStatus(undefined);
    try {
      await saveRootKey(selectedAgentId, encodedKey);
      setEncodedKey("");
      setConfigured(true);
      setStatus({ message: "Root key saved on this device.", local: true });
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        local: false,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setStatus(undefined);
    try {
      await deleteRootKey(selectedAgentId);
      setConfigured(false);
      setEncodedKey("");
      setStatus({ message: "Root key removed from this device.", local: true });
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        local: false,
      });
    } finally {
      setBusy(false);
    }
  }

  function handleGenerate() {
    setEncodedKey(generateEncodedRootKey());
    setStatus({
      message:
        "Generated locally. Copy this key into paxd, then save it for the selected agent.",
      local: true,
    });
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(encodedKey);
      setStatus({
        message: "Root key copied. It has not been sent to PAX Manager.",
        local: true,
      });
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        local: false,
      });
    }
  }

  return (
    <section className="grid min-w-0 gap-4 rounded-lg border border-hairline bg-surface-1 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">
            {t("Encrypted session access")}
          </h2>
          <p className="mt-1 text-xs text-ink-tertiary">
            {t(
              "Pair this device to open end-to-end encrypted sessions. Encryption keys stay locally and are never sent to PAX Manager.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge tone={selectedAgentId && configured ? "success" : "neutral"}>
            {selectedAgentId && configured
              ? t("configured")
              : t("not configured")}
          </Badge>
          <Button asChild size="sm" variant="primary">
            <Link
              href={
                selectedAgentId
                  ? `/e2ee/pairing?agentId=${encodeURIComponent(selectedAgentId)}`
                  : "/e2ee/pairing"
              }
            >
              {configured ? t("Manage paired devices") : t("Pair this device")}
            </Link>
          </Button>
        </div>
      </div>
      {agents.length > 0 ? (
        <div className="grid min-w-0 gap-3 sm:max-w-md">
          <label className="grid min-w-0 gap-1 text-xs text-ink-tertiary">
            {t("Agent")}{" "}
            <select
              className="h-9 w-full min-w-0 rounded-md border border-hairline bg-canvas px-3 text-base text-ink outline-none focus:border-accent sm:text-sm"
              onChange={(event) => setAgentId(event.target.value)}
              value={selectedAgentId}
            >
              {agents.map((agent) => (
                <option key={agent.agent_id} value={agent.agent_id}>
                  {agentLabel(agent)} · {agentNodeLabel(agent, nodes, t)}
                </option>
              ))}
            </select>
          </label>
          <details className="min-w-0 rounded-lg border border-hairline bg-canvas p-3">
            <summary className="cursor-pointer text-sm font-medium text-ink-muted">
              {t("Advanced: manually manage root key")}
            </summary>
            <p className="mt-2 text-xs leading-5 text-warning">
              {t(
                "Development use only. Generating a different key from paxd will make encrypted sessions unreadable on this device.",
              )}
            </p>
            <label className="mt-3 grid min-w-0 gap-1 text-xs text-ink-tertiary">
              {t("Base64 root key")}{" "}
              <input
                autoComplete="off"
                className="h-9 w-full min-w-0 rounded-md border border-hairline bg-surface-1 px-3 font-mono text-base text-ink outline-none focus:border-accent sm:text-sm"
                onChange={(event) => setEncodedKey(event.target.value)}
                placeholder={t("32-byte base64 value")}
                type="password"
                value={encodedKey}
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                disabled={busy || !selectedAgentId}
                onClick={handleGenerate}
                type="button"
              >
                {t("Generate development key")}
              </Button>
              {encodedKey && (
                <Button
                  icon={<Copy className="h-4 w-4" />}
                  onClick={() => void handleCopy()}
                  type="button"
                >
                  {t("Copy")}
                </Button>
              )}
              <Button
                disabled={busy || !selectedAgentId || !encodedKey.trim()}
                onClick={() => void handleSave()}
                type="button"
              >
                {t("Save imported key")}
              </Button>
              {configured && (
                <Button
                  disabled={busy}
                  onClick={() => void handleDelete()}
                  variant="danger"
                  type="button"
                >
                  {t("Remove key from this device")}
                </Button>
              )}
            </div>
          </details>
        </div>
      ) : (
        <p className="text-sm text-ink-tertiary">
          {t("Create an agent before configuring an E2EE root key.")}
        </p>
      )}
      {status && (
        <p className="text-xs text-ink-tertiary">
          {status.local ? t(status.message) : status.message}
        </p>
      )}
    </section>
  );
}

function agentNodeLabel(agent: Agent, nodes: Node[], t: Translator) {
  const node = nodes.find((item) => item.node_id === agent.node_id);
  return node ? nodeLabel(node) : agent.node_id || t("Unknown node");
}

function ApprovalsPanel({
  approvals,
  grants,
  isLoading,
  showPending,
  userId,
}: {
  approvals: AgentApproval[];
  grants: AgentApproval[];
  isLoading: boolean;
  showPending: boolean;
  userId: string;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const decide = useMutation({
    mutationFn: ({
      approvalId,
      optionId,
    }: {
      approvalId: string;
      optionId: string;
    }) => decideApproval(userId, approvalId, optionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.approvals(userId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.approvalGrants(userId),
      });
    },
  });
  const revoke = useMutation({
    mutationFn: (grantId: string) => revokeApprovalGrant(userId, grantId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.approvals(userId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.approvalGrants(userId),
      });
    },
  });

  if (isLoading) {
    return <EmptyState label={t("Loading approvals")} />;
  }

  const pendingApprovals = approvals.filter(
    (approval) => !approval.status || approval.status === "pending",
  );
  const activeGrants = grants.filter((grant) => !grant.grant_revoked_at);

  return (
    <div
      className={`grid min-w-0 gap-5 ${
        showPending
          ? "lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]"
          : "max-w-3xl"
      }`}
    >
      {showPending && (
        <section className="grid gap-3">
          <SectionHeader
            count={pendingApprovals.length}
            title={t("Pending approvals")}
          />
          {pendingApprovals.map((approval) => (
            <article
              className="min-w-0 rounded-lg border border-hairline bg-surface-1 p-3"
              key={approval.approval_id}
            >
              <div className="flex min-w-0 items-start justify-between gap-4">
                <div className="min-w-0">
                  <TruncatedText className="text-base font-medium">
                    {approval.title ??
                      approval.operation ??
                      approval.approval_id}
                  </TruncatedText>
                  <p className="mt-2 text-sm leading-6 text-ink-muted">
                    {approval.description ?? t("No description provided.")}
                  </p>
                </div>
                <Badge>
                  {approval.risk_level ?? approval.status ?? t("pending")}
                </Badge>
              </div>
              <div className="mt-3 grid min-w-0 gap-1">
                <MonoId
                  tooltip={`${approval.domain ?? "unknown domain"} / ${
                    approval.operation ?? "unknown operation"
                  }`}
                >
                  {approval.domain ?? t("unknown domain")} /{" "}
                  {approval.operation ?? t("unknown operation")}
                </MonoId>
                <MonoId
                  tooltip={`${approval.resource_type ?? "resource"}: ${
                    approval.resource_ref ?? "unknown"
                  }`}
                >
                  {approval.resource_type ?? t("resource")}:{" "}
                  {approval.resource_ref
                    ? compactId(approval.resource_ref)
                    : t("unknown")}
                </MonoId>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {approvalOptions(approval, t).map((option) => (
                  <Button
                    disabled={decide.isPending}
                    key={option.option_id}
                    onClick={() =>
                      decide.mutate({
                        approvalId: approval.approval_id,
                        optionId: option.option_id,
                      })
                    }
                    size="sm"
                    tooltip={option.label}
                    type="button"
                    variant="secondary"
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </article>
          ))}
          {pendingApprovals.length === 0 && (
            <EmptyState label={t("No pending approvals")} />
          )}
        </section>
      )}

      <section className="grid content-start gap-3">
        <SectionHeader count={activeGrants.length} title={t("Active grants")} />
        {activeGrants.map((grant) => (
          <article
            className="min-w-0 rounded-lg border border-hairline bg-surface-1 p-3"
            key={grant.approval_id}
          >
            <TruncatedText className="text-sm font-medium">
              {grant.title ?? grant.operation ?? grant.approval_id}
            </TruncatedText>
            <div className="mt-2 grid min-w-0 gap-1">
              <MonoId>{grant.decision_scope ?? t("scope unknown")}</MonoId>
              <MonoId
                tooltip={
                  grant.grant_agent_id ??
                  grant.request_agent_id ??
                  t("agent unknown")
                }
              >
                {compactId(
                  grant.grant_agent_id ??
                    grant.request_agent_id ??
                    "agent unknown",
                )}
              </MonoId>
            </div>
            <Button
              className="mt-3"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate(grant.approval_id)}
              size="sm"
              type="button"
              variant="danger"
            >
              {t("Revoke")}
            </Button>
          </article>
        ))}
        {activeGrants.length === 0 && (
          <EmptyState label={t("No active grants")} />
        )}
      </section>
    </div>
  );
}

function ApiKeysPanel({
  apiKeys,
  isLoading,
  userId,
}: {
  apiKeys: {
    key_id: string;
    name?: string;
    prefix?: string;
    created_at?: string;
  }[];
  isLoading: boolean;
  userId: string;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const createKey = useMutation({
    mutationFn: () => createApiKey(userId, name.trim() || "Console key"),
    onSuccess: (data) => {
      setCopiedSecret(false);
      setCreatedSecret(data.key);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.apiKeys(userId),
      });
    },
  });
  const deleteKey = useMutation({
    mutationFn: (keyId: string) => deleteApiKey(userId, keyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.apiKeys(userId),
      });
    },
  });

  async function copySecret() {
    if (!createdSecret || !navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(createdSecret);
    setCopiedSecret(true);
  }

  if (isLoading) {
    return <EmptyState label={t("Loading API keys")} />;
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-lg border border-hairline bg-surface-1 p-3">
        <div className="flex min-w-0 flex-wrap items-end gap-3">
          <label className="grid flex-1 gap-2 text-sm text-ink-muted">
            {t("Key name")}{" "}
            <input
              className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-base text-ink sm:text-sm"
              onChange={(event) => setName(event.target.value)}
              placeholder={t("Console key")}
              value={name}
            />
          </label>
          <Button
            className="w-full min-w-36 sm:w-auto"
            disabled={createKey.isPending}
            icon={<Plus className="h-4 w-4" />}
            onClick={() => createKey.mutate()}
            tooltip={t("Create API key")}
            type="button"
            variant="primary"
          >
            {createKey.isPending ? t("Creating...") : t("Create key")}
          </Button>
        </div>
        {createdSecret && (
          <div className="mt-4 rounded-lg border border-warning bg-canvas p-3">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink">
                  {t("Copy this key now. It will not be shown again.")}
                </div>
                <div className="mt-1 text-xs text-ink-tertiary">
                  {t(
                    "The secret stays only in this browser tab until you leave the page.",
                  )}
                </div>
              </div>
              <Button
                icon={
                  copiedSecret ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )
                }
                onClick={() => void copySecret()}
                size="sm"
                tooltip={copiedSecret ? t("Copied key") : t("Copy key")}
                type="button"
                variant="ghost"
              >
                {copiedSecret ? t("Copied") : t("Copy")}
              </Button>
            </div>
            <div className="mt-2 max-h-32 overflow-auto break-all rounded-md border border-hairline bg-surface-1 p-2 font-mono text-xs text-ink-muted">
              {createdSecret}
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <SectionHeader count={apiKeys.length} title={t("Existing keys")} />
        <div className="grid overflow-hidden rounded-lg border border-hairline">
          {apiKeys.map((apiKey) => (
            <article
              className="flex min-w-0 items-center justify-between gap-4 border-b border-hairline bg-surface-1 px-3 py-3 last:border-b-0"
              key={apiKey.key_id}
            >
              <div className="min-w-0 flex-1">
                <TruncatedText className="text-sm font-medium">
                  {apiKey.name ?? apiKey.key_id}
                </TruncatedText>
                <MonoId className="mt-1" tooltip={apiKey.key_id}>
                  {apiKey.prefix ?? compactId(apiKey.key_id)}
                </MonoId>
              </div>
              <Button
                disabled={deleteKey.isPending}
                onClick={() => deleteKey.mutate(apiKey.key_id)}
                size="sm"
                type="button"
                variant="danger"
              >
                {t("Revoke")}
              </Button>
            </article>
          ))}
        </div>
        {apiKeys.length === 0 && <EmptyState label={t("No API keys")} />}
      </section>
    </div>
  );
}

function SectionHeader({ count, title }: { count: number; title: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <TruncatedText className="text-base font-medium">{title}</TruncatedText>
      <Badge className="font-mono">{String(count)}</Badge>
    </div>
  );
}

function ActiveFilterToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <label className="flex shrink-0 items-center gap-2 text-sm text-ink-muted">
      <span>{t("Show all")}</span>
      <button
        aria-checked={checked}
        aria-label={t("Show all resources")}
        className={`relative h-5 w-9 rounded-full border transition ${
          checked
            ? "border-primary bg-primary/15"
            : "border-hairline-strong bg-surface-2"
        }`}
        onClick={() => onChange(!checked)}
        role="switch"
        type="button"
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-ink transition ${
            checked ? "left-4 bg-primary" : "left-0.5 bg-ink-tertiary"
          }`}
        />
      </button>
    </label>
  );
}

function supportsActiveFilter(kind: ResourceKind) {
  return kind === "sessions";
}

function approvalOptions(approval: AgentApproval, t: Translator) {
  const options = approval.options?.filter((option) => option.option_id) ?? [];

  if (options.length > 0) {
    return options.map((option) => ({
      label: option.label ?? option.decision ?? option.option_id ?? t("Decide"),
      option_id: option.option_id as string,
    }));
  }

  return [
    { label: t("Approve"), option_id: "approve" },
    { label: t("Deny"), option_id: "deny" },
  ];
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-hairline bg-surface-1 p-4 text-sm text-ink-tertiary">
      {label}
    </div>
  );
}

function ApiNotice({ error }: { error: Error | null }) {
  const { t } = useI18n();
  if (!error) {
    return null;
  }

  return (
    <div className="flex min-w-0 items-start gap-3 rounded-lg border border-hairline bg-surface-1 p-3 text-sm text-ink-muted">
      <AlertCircle className="mt-0.5 h-4 w-4 text-warning" />
      <div className="min-w-0">
        <div className="font-medium text-ink">{t("API request failed")}</div>
        <TruncatedText className="mt-1 font-mono text-xs text-ink-tertiary">
          {error.name}: {error.message}
        </TruncatedText>
      </div>
    </div>
  );
}

function firstQueryError(queries: Array<{ error: Error | null }>) {
  return queries.find((query) => query.error)?.error ?? null;
}
