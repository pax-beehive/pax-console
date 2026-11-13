"use client";
import { useI18n } from "@/features/i18n/use-i18n";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TruncatedText } from "@/components/ui/text";
import type { Agent, Health, Node } from "@/features/api/types";
import {
  agentLabel,
  isDeviceNode,
  nodeLabel,
} from "@/components/resources/resource-models";
import { connectionState, serviceHealth } from "./service-health";

export function ServiceStatusPanel({
  nodes,
  agents,
  health,
  loading,
  error,
  recentSessions,
  refresh,
  refreshing,
}: {
  nodes?: Node[];
  agents?: Agent[];
  health?: Health;
  loading: boolean;
  error: boolean;
  recentSessions?: number;
  refresh: () => void;
  refreshing: boolean;
}) {
  const { t } = useI18n();
  const devices = nodes?.filter(isDeviceNode);
  const serviceLabels: Record<string, string> = {
    ok: "ok",
    healthy: "healthy",
    up: "up",
    operational: "operational",
    degraded: "degraded",
    down: "down",
  };
  const serviceLabel = health?.status
    ? serviceLabels[health.status.toLowerCase()]
    : undefined;
  const summary = serviceHealth({ t, nodes, agents, health, loading, error });
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <section className="border-b border-hairline pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">{summary.title}</h2>
          <Button
            disabled={refreshing}
            onClick={refresh}
            icon={<RefreshCw className="h-4 w-4" />}
          >
            {refreshing ? t("Checking...") : t("Refresh")}
          </Button>
        </div>
        <p className="mt-2 text-sm text-ink-tertiary">{summary.description}</p>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-ink-tertiary">{t("PAX service")}</dt>
            <dd className="mt-1">
              {loading
                ? t("Checking")
                : serviceLabel
                  ? t(serviceLabel)
                  : (health?.status ?? t("Unknown"))}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-tertiary">{t("Online devices")}</dt>
            <dd className="mt-1">
              {devices
                ? `${devices.filter((n) => connectionState(n) === "Online").length} / ${devices.length}`
                : t("Unknown")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-tertiary">{t("Active agents")}</dt>
            <dd className="mt-1">
              {agents
                ? `${agents.filter((a) => connectionState(a) === "Online").length} / ${agents.length}`
                : t("Unknown")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-tertiary">
              {t("Recent sessions")}
            </dt>
            <dd className="mt-1">{recentSessions ?? t("Unknown")}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-ink-tertiary">
          {t(
            "Service and connection status are reported separately. An online device does not guarantee that its agents are running.",
          )}
        </p>
      </section>
      <StatusList
        title={t("Devices")}
        empty={t("No devices connected yet.")}
        items={devices?.map((node) => ({
          id: node.node_id,
          name: nodeLabel(node),
          state: connectionState(node),
          href: `/nodes/${encodeURIComponent(node.node_id)}`,
          description: `${node.os ?? t("Unknown OS")} / ${node.arch ?? t("Unknown architecture")}`,
        }))}
      />
      <StatusList
        title={t("Agents")}
        empty={t("No agents registered yet.")}
        items={agents?.map((agent) => ({
          id: agent.agent_id,
          name: agentLabel(agent),
          state: connectionState(agent),
          href: `/agents/${encodeURIComponent(agent.agent_id)}${agent.node_id ? `?nodeId=${encodeURIComponent(agent.node_id)}` : ""}`,
          description:
            nodes?.find((n) => n.node_id === agent.node_id)?.name ??
            agent.node_id ??
            t("Device not reported"),
        }))}
      />
      {devices?.some((n) => connectionState(n) === "Offline") && (
        <p className="rounded-lg border border-hairline p-4 text-sm text-ink-muted">
          {t(
            "For an offline device, check that it is powered on and connected to the internet. Open its details to inspect the last heartbeat and runtime information.",
          )}
        </p>
      )}
    </div>
  );
}

function StatusList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items?: {
    id: string;
    name: string;
    href: string;
    description: string;
    state: ReturnType<typeof connectionState>;
  }[];
}) {
  const { t } = useI18n();
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      <div className="overflow-hidden rounded-lg border border-hairline">
        {items?.length ? (
          items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="flex min-w-0 items-center gap-3 border-b border-hairline bg-surface-1 p-4 last:border-0 hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1">
                <TruncatedText className="block text-sm font-medium">
                  {item.name}
                </TruncatedText>
                <TruncatedText className="mt-1 block text-xs text-ink-tertiary">
                  {item.description}
                </TruncatedText>
              </span>
              <Badge
                tone={
                  item.state === "Online"
                    ? "success"
                    : item.state === "Offline"
                      ? "warning"
                      : "neutral"
                }
              >
                {t(item.state)}
              </Badge>
            </Link>
          ))
        ) : (
          <p className="p-4 text-sm text-ink-tertiary">
            {items ? t(empty) : t("Status unavailable")}
          </p>
        )}
      </div>
    </section>
  );
}
