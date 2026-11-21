"use client";
import { useI18n } from "@/features/i18n/use-i18n";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/inline-error";
import {
  isDeviceNode,
  nodeLabel,
} from "@/components/resources/resource-models";
import { useNodes } from "@/features/api/resources";
import { AgentConnectStep } from "./agent-connect-step";
import { DeviceConnectStep } from "./device-connect-step";

export function ConnectionOnboarding({
  userId,
  intent = "first-agent",
  initialNodeId,
  onStart,
}: {
  userId: string;
  intent?: "first-agent" | "device" | "agent";
  initialNodeId?: string;
  onStart?: () => void;
}) {
  const { t } = useI18n();
  const nodesQuery = useNodes(userId, 3000);
  const nodes = nodesQuery.data?.nodes.filter(isDeviceNode) ?? [];
  const [selectedId, setSelectedId] = useState(initialNodeId ?? "");
  const [addingDevice, setAddingDevice] = useState(intent === "device");
  const effectiveId =
    selectedId || (!addingDevice && nodes.length === 1 ? nodes[0].node_id : "");
  const selected = nodes.find((node) => node.node_id === effectiveId);
  const deviceStep =
    addingDevice || (nodesQuery.isSuccess && !nodes.length && !initialNodeId);

  return (
    <div className="grid min-w-0 gap-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {intent === "device"
            ? t("Connect a device")
            : intent === "agent"
              ? t("Connect an agent")
              : t("Connect your first agent")}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          {t("Connect a computer, then choose the agent you want to use.")}
        </p>
      </div>
      <ol
        className="flex flex-wrap gap-x-6 gap-y-2 text-sm"
        aria-label={t("Connection steps")}
      >
        <li
          aria-current={deviceStep || !selected ? "step" : undefined}
          className={
            selected?.online && !deviceStep ? "text-ink-muted" : "text-ink"
          }
        >
          {t("① Connect a device")}
        </li>
        <li
          aria-current={!deviceStep && selected ? "step" : undefined}
          className={!deviceStep && selected ? "text-ink" : "text-ink-tertiary"}
        >
          {t("② Connect an agent")}
        </li>
      </ol>
      {nodesQuery.isLoading && (
        <p role="status" className="text-sm text-ink-muted">
          {t("Loading your computers…")}
        </p>
      )}
      {nodesQuery.error && (
        <>
          <InlineError error={nodesQuery.error} />
          <div>
            <Button onClick={() => void nodesQuery.refetch()}>
              {t("Try again")}
            </Button>
          </div>
        </>
      )}
      {deviceStep ? (
        <>
          <DeviceConnectStep
            userId={userId}
            onStart={() => {
              setAddingDevice(true);
              onStart?.();
            }}
            onConnected={(node) => {
              onStart?.();
              setSelectedId(node.node_id);
              setAddingDevice(false);
            }}
          />
          {nodes.length > 0 && (
            <div>
              <Button variant="ghost" onClick={() => setAddingDevice(false)}>
                {t("Use an existing computer")}
              </Button>
            </div>
          )}
        </>
      ) : (
        nodesQuery.isSuccess && (
          <>
            {nodes.length > 1 && (
              <label className="grid gap-2 text-sm">
                {t("Which computer should run this agent?")}
                <select
                  className="min-w-0 rounded-md border border-hairline bg-canvas p-2 text-base"
                  value={effectiveId}
                  onChange={(event) => {
                    onStart?.();
                    setSelectedId(event.target.value);
                  }}
                >
                  <option value="">{t("Choose a computer")}</option>
                  {nodes.map((node) => (
                    <option value={node.node_id} key={node.node_id}>
                      {nodeLabel(node)}
                      {node.online === true ? "" : t(" (Offline)")}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {effectiveId && !selected && (
              <p role="status" className="text-sm text-warning">
                {t(
                  "This computer is no longer available. Choose another computer or connect a new one.",
                )}
              </p>
            )}
            {selected && (
              <>
                <div
                  className="flex items-center gap-2 rounded-lg border border-hairline bg-canvas p-3 text-sm"
                  role="status"
                >
                  {selected.online === true && (
                    <Check className="h-4 w-4 text-accent-bright" />
                  )}
                  {nodeLabel(selected)}{" "}
                  {selected.online === true
                    ? t("is connected")
                    : t("is offline")}
                </div>
                <AgentConnectStep
                  key={selected.node_id}
                  node={selected}
                  userId={userId}
                  onStart={onStart}
                />
              </>
            )}
            <div className="border-t border-hairline pt-4">
              <Button
                variant="ghost"
                onClick={() => {
                  onStart?.();
                  setAddingDevice(true);
                }}
              >
                {t("Connect another computer")}
              </Button>
            </div>
          </>
        )
      )}
    </div>
  );
}
