"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Archive,
  Bot,
  Check,
  CirclePlus,
  Code2,
  Crosshair,
  Maximize2,
  Megaphone,
  MousePointer2,
  Plus,
  Route,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  DragEvent,
  FormEvent,
  MouseEvent,
  useMemo,
  useState,
} from "react";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MonoId, TruncatedText } from "@/components/ui/text";
import {
  broadcastToWhiteboardAgents,
  initializeWhiteboardAgent,
  InitializeWhiteboardAgentInput,
  useWhiteboardCatalog,
  WhiteboardAgent,
  WhiteboardAgentTemplate,
} from "@/features/api/whiteboard";
import { useAgents, useNodes } from "@/features/api/resources";
import { Agent, User } from "@/features/api/types";
import { cn } from "@/lib/utils";
import {
  canUseWhiteboard,
  clampBoardPosition,
  clampZoom,
  createTaskArea,
  layoutAgentPositions,
  nextAgentPosition,
  nextTaskAreaIndex,
  sortOverviewAgents,
  TaskArea,
} from "./whiteboard-models";

const agentTemplateMimeType = "application/x-pax-whiteboard-agent";
const registeredAgentComponentId = "registered-agent-component";
const existingAgentMimeType = "application/x-pax-whiteboard-existing-agent";
const eventTriggerMimeType = "application/x-pax-whiteboard-event-trigger";
const existingEventTriggerMimeType =
  "application/x-pax-whiteboard-existing-event-trigger";
const boardWidth = 1120;
const boardHeight = 720;
const defaultEventTriggerScript = `def should_trigger(event, state):
    """
    Return True when this trigger should call into the task.
    event and state are mocked on the frontend for now.
    """
    return event.get("type") == "ready"`;

type WhiteboardPageClientProps = {
  user: User;
};

type PendingPlacement = {
  areaId: string;
  templateId: string;
  x: number;
  y: number;
};

type PendingEventTriggerPlacement = {
  areaId: string;
  x: number;
  y: number;
};

type WhiteboardEventTrigger = {
  areaId: string;
  cronExpression?: string;
  description: string;
  id: string;
  intervalMinutes?: number;
  lastMatchedAt?: string;
  name: string;
  pythonScript: string;
  scheduleKind?: "interval" | "cron";
  timezone?: string;
  triggerMode: "python" | "scheduled";
  x: number;
  y: number;
};

type BoardComponent = {
  areaId: string;
  id: string;
  kind: "agent" | "event_trigger";
  name: string;
  x: number;
  y: number;
};

type ConnectorSide = "top" | "right" | "bottom" | "left";

type AgentConnection = {
  areaId: string;
  conditionOutput?: string;
  description: string;
  direction: "forward" | "reverse" | "bidirectional";
  fromAgentId: string;
  id: string;
  kind: "context" | "event_trigger";
  label: string;
  toAgentId: string;
  triggerWith?: string;
};

type ConnectionDraft = {
  areaId: string;
  fromAgentId: string;
  fromSide: ConnectorSide;
  x: number;
  y: number;
};

type PendingConnectionConfig = {
  areaId: string;
  fromAgentId: string;
  toAgentId: string;
};

type AgentConfigTarget = {
  agent: WhiteboardAgent;
};

type EventTriggerConfigTarget = {
  trigger: WhiteboardEventTrigger;
};

type TaskEditorTarget = TaskArea | "new";

export function WhiteboardPageClient({ user }: WhiteboardPageClientProps) {
  const router = useRouter();
  const nodesQuery = useNodes(user.user_id);
  const registeredAgentsQuery = useAgents(user.user_id);
  const nodes = nodesQuery.data?.nodes ?? [];
  const [areas, setAreas] = useState<TaskArea[]>(() => [createTaskArea(1)]);
  const [agents, setAgents] = useState<WhiteboardAgent[]>([]);
  const [eventTriggers, setEventTriggers] = useState<WhiteboardEventTrigger[]>(
    [],
  );
  const [detailAreaId, setDetailAreaId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedTriggerId, setSelectedTriggerId] = useState<string | null>(
    null,
  );
  const [pendingPlacement, setPendingPlacement] =
    useState<PendingPlacement | null>(null);
  const [pendingEventTriggerPlacement, setPendingEventTriggerPlacement] =
    useState<PendingEventTriggerPlacement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [agentPaletteOpen, setAgentPaletteOpen] = useState(true);
  const [taskControlOpen, setTaskControlOpen] = useState(true);
  const [draggingComponentId, setDraggingComponentId] = useState<string | null>(
    null,
  );
  const [connections, setConnections] = useState<AgentConnection[]>([]);
  const [connectionDraft, setConnectionDraft] =
    useState<ConnectionDraft | null>(null);
  const [pendingConnection, setPendingConnection] =
    useState<PendingConnectionConfig | null>(null);
  const [editingConnection, setEditingConnection] =
    useState<AgentConnection | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(null);
  const [agentConfigTarget, setAgentConfigTarget] =
    useState<AgentConfigTarget | null>(null);
  const [eventTriggerConfigTarget, setEventTriggerConfigTarget] =
    useState<EventTriggerConfigTarget | null>(null);
  const [taskEditorTarget, setTaskEditorTarget] =
    useState<TaskEditorTarget | null>(null);
  const [overviewBroadcastDrafts, setOverviewBroadcastDrafts] = useState<
    Record<string, string>
  >({});
  const [lastBroadcast, setLastBroadcast] = useState<{
    areaId: string;
    deliveredAt: string;
    targetCount: number;
  } | null>(null);
  const isAdmin = canUseWhiteboard(user);
  const catalogQuery = useWhiteboardCatalog(isAdmin);
  const templates = useMemo(
    () => registeredAgentTemplates(registeredAgentsQuery.data?.agents ?? []),
    [registeredAgentsQuery.data?.agents],
  );
  const models = catalogQuery.data?.models ?? [];
  const defaultModelId =
    models.find((model) => model.isDefault)?.id ?? models[0]?.id ?? "default";
  const detailArea = areas.find((area) => area.id === detailAreaId) ?? null;
  const detailAgents = useMemo(
    () => agents.filter((agent) => agent.areaId === detailArea?.id),
    [agents, detailArea?.id],
  );
  const detailEventTriggers = useMemo(
    () =>
      eventTriggers.filter((trigger) => trigger.areaId === detailArea?.id),
    [eventTriggers, detailArea?.id],
  );
  const detailComponents = useMemo(
    () => toBoardComponents(detailAgents, detailEventTriggers),
    [detailAgents, detailEventTriggers],
  );
  const selectedAgent =
    agents.find((agent) => agent.id === selectedAgentId) ?? undefined;
  const selectedTrigger =
    eventTriggers.find((trigger) => trigger.id === selectedTriggerId) ??
    undefined;
  const selectedConnection =
    connections.find((connection) => connection.id === selectedConnectionId) ??
    null;
  const initializeAgent = useMutation({
    mutationFn: initializeWhiteboardAgent,
    onSuccess: (agent) => {
      setAgents((current) => [...current, agent]);
      setDetailAreaId(agent.areaId);
      setSelectedAgentId(agent.id);
      setSelectedTriggerId(null);
      setSelectedConnectionId(null);
      setPendingPlacement(null);
    },
  });
  const broadcast = useMutation({
    mutationFn: broadcastToWhiteboardAgents,
    onSuccess: (result) => {
      setLastBroadcast({
        areaId: result.areaId,
        deliveredAt: result.deliveredAt,
        targetCount: result.targetAgentIds.length,
      });
      setOverviewBroadcastDrafts((current) => ({
        ...current,
        [result.areaId]: "",
      }));
    },
  });

  function openDetail(areaId: string, selectedAgentId?: string) {
    setDetailAreaId(areaId);
    setSelectedAgentId(selectedAgentId ?? null);
    setSelectedTriggerId(null);
    setSelectedConnectionId(null);
    setZoom(1);
  }

  function openSession(sessionId: string) {
    router.push(`/sessions/${encodeURIComponent(sessionId)}`);
  }

  function openPlacement(
    areaId: string,
    templateId: string,
    event?: DragEvent<HTMLElement>,
  ) {
    const proposed = event
      ? boardDropPosition(event, zoom)
      : undefined;
    const existing = [
      ...agents.filter((agent) => agent.areaId === areaId),
      ...eventTriggers.filter((trigger) => trigger.areaId === areaId),
    ].map((component) => ({ x: component.x, y: component.y }));
    setPendingPlacement({
      areaId,
      templateId,
      ...resolveBoardPosition(existing, proposed),
    });
  }

  function openEventTriggerPlacement(
    areaId: string,
    event?: DragEvent<HTMLElement>,
  ) {
    const proposed = event
      ? boardDropPosition(event, zoom)
      : undefined;
    const existing = [
      ...agents.filter((agent) => agent.areaId === areaId),
      ...eventTriggers.filter((trigger) => trigger.areaId === areaId),
    ].map((component) => ({ x: component.x, y: component.y }));
    setPendingEventTriggerPlacement({
      areaId,
      ...resolveBoardPosition(existing, proposed),
    });
  }

  function submitPlacement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingPlacement) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const input: InitializeWhiteboardAgentInput = {
      ...pendingPlacement,
      goal: String(formData.get("goal") ?? "").trim(),
      modelId: String(formData.get("modelId") ?? defaultModelId),
      name: String(formData.get("name") ?? "").trim(),
      templateId: String(formData.get("templateId") ?? ""),
    };
    if (!input.name || !input.goal || !input.templateId) {
      return;
    }

    initializeAgent.mutate(input);
  }

  function submitEventTriggerPlacement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingEventTriggerPlacement) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const triggerConfig = parseEventTriggerForm(formData);
    if (!name || !triggerConfig) {
      return;
    }

    const trigger: WhiteboardEventTrigger = {
      ...pendingEventTriggerPlacement,
      ...triggerConfig,
      description,
      id: `wbt_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      name,
    };
    setEventTriggers((current) => [...current, trigger]);
    setDetailAreaId(trigger.areaId);
    setSelectedAgentId(null);
    setSelectedTriggerId(trigger.id);
    setSelectedConnectionId(null);
    setPendingEventTriggerPlacement(null);
  }

  function selectAgent(agentId: string) {
    setSelectedConnectionId(null);
    setSelectedTriggerId(null);
    setSelectedAgentId(agentId);
  }

  function selectTrigger(triggerId: string) {
    setSelectedConnectionId(null);
    setSelectedAgentId(null);
    setSelectedTriggerId(triggerId);
  }

  function moveComponent(componentId: string, event: DragEvent<HTMLElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = clampBoardPosition(
      (event.clientX - bounds.left) / zoom,
      boardWidth,
    );
    const y = clampBoardPosition(
      (event.clientY - bounds.top) / zoom,
      boardHeight,
    );
    setAgents((current) =>
      current.map((agent) =>
        agent.id === componentId
          ? {
              ...agent,
              x,
              y,
            }
          : agent,
      ),
    );
    setEventTriggers((current) =>
      current.map((trigger) =>
        trigger.id === componentId
          ? {
              ...trigger,
              x,
              y,
            }
          : trigger,
      ),
    );
    setDraggingComponentId(null);
  }

  function autoLayoutDetailAgents() {
    if (!detailArea) {
      return;
    }

    const positions = new Map(
      layoutAgentPositions(detailComponents).map((position) => [
        position.id,
        position,
      ]),
    );
    setAgents((current) =>
      current.map((agent) => {
        const position = positions.get(agent.id);
        return position ? { ...agent, x: position.x, y: position.y } : agent;
      }),
    );
    setEventTriggers((current) =>
      current.map((trigger) => {
        const position = positions.get(trigger.id);
        return position
          ? {
              ...trigger,
              x: position.x,
              y: position.y,
            }
          : trigger;
      }),
    );
  }

  function submitAreaBroadcast(areaId: string) {
    const areaAgents = agents.filter((agent) => agent.areaId === areaId);
    const message = overviewBroadcastDrafts[areaId]?.trim() ?? "";
    if (areaAgents.length === 0 || !message) {
      return;
    }

    broadcast.mutate({
      areaId,
      message,
      targetAgentIds: areaAgents.map((agent) => agent.id),
    });
  }

  function submitConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingConnection) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const components = toBoardComponents(agents, eventTriggers);
    const triggerEndpoints = resolveEventTriggerConnection(
      pendingConnection.fromAgentId,
      pendingConnection.toAgentId,
      components,
    );
    if (triggerEndpoints) {
      const conditionOutput = String(
        formData.get("conditionOutput") ?? "",
      ).trim();
      const triggerWith = String(formData.get("triggerWith") ?? "").trim();
      if (!conditionOutput || !triggerWith) {
        return;
      }

      setConnections((current) => [
        ...current,
        {
          areaId: pendingConnection.areaId,
          conditionOutput,
          description: "",
          direction: "forward",
          fromAgentId: triggerEndpoints.trigger.id,
          id: `conn_${Date.now().toString(36)}`,
          kind: "event_trigger",
          label: `output = ${conditionOutput}`,
          toAgentId: triggerEndpoints.target.id,
          triggerWith,
        },
      ]);
      setPendingConnection(null);
      setConnectionDraft(null);
      return;
    }

    const direction = normalizeConnectionDirection(formData.get("direction"));
    const label =
      String(formData.get("label") ?? "").trim() || "Shares context";
    const description = String(formData.get("description") ?? "").trim();
    setConnections((current) => [
      ...current,
      {
        areaId: pendingConnection.areaId,
        description,
        direction,
        fromAgentId: pendingConnection.fromAgentId,
        id: `conn_${Date.now().toString(36)}`,
        kind: "context",
        label,
        toAgentId: pendingConnection.toAgentId,
      },
    ]);
    setPendingConnection(null);
    setConnectionDraft(null);
  }

  function submitConnectionEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingConnection) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const fromAgentId = String(formData.get("fromAgentId") ?? "");
    const toAgentId = String(formData.get("toAgentId") ?? "");
    if (!fromAgentId || !toAgentId || fromAgentId === toAgentId) {
      return;
    }

    const label =
      String(formData.get("label") ?? "").trim() || "Shares context";
    const description = String(formData.get("description") ?? "").trim();
    const direction = normalizeConnectionDirection(formData.get("direction"));
    const components = toBoardComponents(agents, eventTriggers).filter(
      (component) => component.areaId === editingConnection.areaId,
    );
    const triggerEndpoints = resolveEventTriggerConnection(
      fromAgentId,
      toAgentId,
      components,
    );
    if (triggerEndpoints) {
      const conditionOutput = String(
        formData.get("conditionOutput") ?? "",
      ).trim();
      const triggerWith = String(formData.get("triggerWith") ?? "").trim();
      if (!conditionOutput || !triggerWith) {
        return;
      }

      setConnections((current) =>
        current.map((connection) =>
          connection.id === editingConnection.id
            ? {
                ...connection,
                conditionOutput,
                description: "",
                direction: "forward",
                fromAgentId: triggerEndpoints.trigger.id,
                kind: "event_trigger",
                label: `output = ${conditionOutput}`,
                toAgentId: triggerEndpoints.target.id,
                triggerWith,
              }
            : connection,
        ),
      );
      setEditingConnection(null);
      return;
    }

    setConnections((current) =>
      current.map((connection) =>
        connection.id === editingConnection.id
          ? {
              ...connection,
              conditionOutput: undefined,
              description,
              direction,
              fromAgentId,
              kind: "context",
              label,
              toAgentId,
              triggerWith: undefined,
            }
          : connection,
      ),
    );
    setEditingConnection(null);
  }

  function submitAgentConfigure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!agentConfigTarget) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const goal = String(formData.get("goal") ?? "").trim();
    const templateId = String(formData.get("templateId") ?? "");
    const modelId = String(formData.get("modelId") ?? "");
    const status = String(formData.get("status") ?? "") as WhiteboardAgent["status"];
    if (!name || !goal || !templateId || !modelId) {
      return;
    }

    setAgents((current) =>
      current.map((agent) =>
        agent.id === agentConfigTarget.agent.id
          ? {
              ...agent,
              goal,
              modelId,
              name,
              status,
              templateId,
            }
          : agent,
      ),
    );
    setAgentConfigTarget(null);
  }

  function submitEventTriggerConfigure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!eventTriggerConfigTarget) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const triggerConfig = parseEventTriggerForm(formData);
    if (!name || !triggerConfig) {
      return;
    }

    setEventTriggers((current) =>
      current.map((trigger) =>
        trigger.id === eventTriggerConfigTarget.trigger.id
          ? {
              ...trigger,
              ...triggerConfig,
              description,
              name,
            }
          : trigger,
      ),
    );
    setEventTriggerConfigTarget(null);
  }

  function submitTaskEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!taskEditorTarget) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    if (!name || !description) {
      return;
    }

    if (taskEditorTarget === "new") {
      const area = createTaskArea(nextTaskAreaIndex(areas), {
        description,
        name,
      });
      setAreas((current) => [...current, area]);
      setDetailAreaId(area.id);
      setSelectedAgentId(null);
      setSelectedTriggerId(null);
      setSelectedConnectionId(null);
      setZoom(1);
    } else {
      setAreas((current) =>
        current.map((area) =>
          area.id === taskEditorTarget.id
            ? {
                ...area,
                description,
                name,
              }
            : area,
        ),
      );
    }

    setTaskEditorTarget(null);
  }

  function archiveTask(areaId: string) {
    setAreas((current) =>
      current.map((area) =>
        area.id === areaId
          ? {
              ...area,
              archivedAt: new Date().toISOString(),
            }
          : area,
      ),
    );
    if (detailAreaId === areaId) {
      setDetailAreaId(null);
      setSelectedAgentId(null);
      setSelectedTriggerId(null);
      setSelectedConnectionId(null);
    }
  }

  return (
    <ConsoleLayout nodes={nodes} user={user}>
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex min-w-0 items-center justify-between gap-3 border-b border-hairline px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {detailArea && (
              <Button
                icon={<ArrowLeft className="h-4 w-4" />}
                onClick={() => setDetailAreaId(null)}
                size="icon"
                tooltip="Back to tasks"
                type="button"
                variant="ghost"
              />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-ink-tertiary">
                <Crosshair className="h-4 w-4" />
                admin workspace
              </div>
              <h1 className="mt-2 text-2xl font-semibold">
                {detailArea?.name ?? "Whiteboard"}
              </h1>
            </div>
          </div>
          {isAdmin && (
            <div className="flex shrink-0 items-center gap-2">
              {detailArea && (
                <Button
                  icon={<Settings2 className="h-4 w-4" />}
                  onClick={() => setTaskEditorTarget(detailArea)}
                  tooltip="Edit task"
                  type="button"
                >
                  Edit task
                </Button>
              )}
              <Button
                icon={<CirclePlus className="h-4 w-4" />}
                onClick={() => setTaskEditorTarget("new")}
                tooltip="New task"
                type="button"
                variant="primary"
              >
                New task
              </Button>
            </div>
          )}
        </header>

        {!isAdmin ? (
          <AccessDenied />
        ) : detailArea ? (
          <div
            className="grid min-h-0 flex-1 overflow-hidden"
            style={{
              gridTemplateColumns: `${
                agentPaletteOpen ? "220px" : "48px"
              } minmax(0,1fr) ${taskControlOpen ? "320px" : "48px"}`,
            }}
          >
            {agentPaletteOpen ? (
              <ComponentPalette
                isLoading={registeredAgentsQuery.isLoading}
                onAddAgent={() =>
                  openPlacement(
                    detailArea.id,
                    templates[0]?.id ?? registeredAgentComponentId,
                  )
                }
                onAddEventTrigger={() =>
                  openEventTriggerPlacement(detailArea.id)
                }
                onCollapse={() => setAgentPaletteOpen(false)}
              />
            ) : (
              <CollapsedRail
                icon={<Bot className="h-4 w-4" />}
                label="Components"
                onOpen={() => setAgentPaletteOpen(true)}
              />
            )}
            <TaskWorkspace
              agents={detailAgents}
              area={detailArea}
              connectionDraft={connectionDraft}
              connections={connections.filter(
                (connection) => connection.areaId === detailArea.id,
              )}
              draggingComponentId={draggingComponentId}
              eventTriggers={detailEventTriggers}
              onAgentClick={(agent, event) => {
                event.stopPropagation();
                selectAgent(agent.id);
              }}
              onAutoLayout={autoLayoutDetailAgents}
              onConnectionDraftMove={(x, y) =>
                setConnectionDraft((current) =>
                  current
                    ? {
                        ...current,
                        x,
                        y,
                      }
                    : current,
                )
              }
              onConnectionCancel={() => setConnectionDraft(null)}
              onConnectionEnd={(agentId) => {
                if (
                  connectionDraft &&
                  connectionDraft.fromAgentId !== agentId
                ) {
                  setPendingConnection({
                    areaId: detailArea.id,
                    fromAgentId: connectionDraft.fromAgentId,
                    toAgentId: agentId,
                  });
                }
              }}
              onConnectionSelect={(connectionId) => {
                setSelectedAgentId(null);
                setSelectedTriggerId(null);
                setSelectedConnectionId(connectionId);
              }}
              onConnectionStart={(component, side) => {
                const point = componentPoint(component, side);
                setConnectionDraft({
                  areaId: detailArea.id,
                  fromAgentId: component.id,
                  fromSide: side,
                  x: point.x,
                  y: point.y,
                });
              }}
              onDropAgent={(templateId, event) =>
                openPlacement(detailArea.id, templateId, event)
              }
              onDropEventTrigger={(event) =>
                openEventTriggerPlacement(detailArea.id, event)
              }
              onDragComponentEnd={() => setDraggingComponentId(null)}
              onDragComponentStart={setDraggingComponentId}
              onMoveComponent={moveComponent}
              onTriggerClick={(trigger, event) => {
                event.stopPropagation();
                selectTrigger(trigger.id);
              }}
              onZoomChange={(value) => setZoom(clampZoom(value))}
              selectedAgentId={selectedAgentId}
              selectedConnectionId={selectedConnectionId}
              selectedTriggerId={selectedTriggerId}
              templates={templates}
              zoom={zoom}
            />
            {taskControlOpen ? (
              <InspectorPanel
                agents={detailAgents}
                eventTriggers={detailEventTriggers}
                onConfigureAgent={(agent) => setAgentConfigTarget({ agent })}
                onConfigureTrigger={(trigger) =>
                  setEventTriggerConfigTarget({ trigger })
                }
                onCollapse={() => setTaskControlOpen(false)}
                onDeleteConnection={(connectionId) =>
                  setConnections((current) => {
                    setSelectedConnectionId(null);
                    return current.filter(
                      (connection) => connection.id !== connectionId,
                    );
                  })
                }
                onEditConnection={setEditingConnection}
                selectedAgent={selectedAgent}
                selectedConnection={selectedConnection}
                selectedTrigger={selectedTrigger}
              />
            ) : (
              <CollapsedRail
                icon={<Route className="h-4 w-4" />}
                label="Details"
                onOpen={() => setTaskControlOpen(true)}
              />
            )}
          </div>
        ) : (
          <TaskOverview
            agents={agents}
            areas={areas}
            broadcastDrafts={overviewBroadcastDrafts}
            isBroadcasting={broadcast.isPending}
            lastBroadcast={lastBroadcast}
            onBroadcast={submitAreaBroadcast}
            onBroadcastDraftChange={(areaId, value) =>
              setOverviewBroadcastDrafts((current) => ({
                ...current,
                [areaId]: value,
              }))
            }
            onArchiveTask={archiveTask}
            onOpen={openDetail}
            onOpenSession={openSession}
            onTaskEdit={setTaskEditorTarget}
          />
        )}
      </div>

      <InitializeAgentDialog
        defaultModelId={defaultModelId}
        isPending={initializeAgent.isPending}
        models={models}
        onOpenChange={(open) => {
          if (!open && !initializeAgent.isPending) {
            setPendingPlacement(null);
          }
        }}
        onSubmit={submitPlacement}
        pendingPlacement={pendingPlacement}
        templates={templates}
      />
      <EventTriggerDialog
        onOpenChange={(open) => {
          if (!open) {
            setPendingEventTriggerPlacement(null);
          }
        }}
        onSubmit={submitEventTriggerPlacement}
        pendingPlacement={pendingEventTriggerPlacement}
      />
      <TaskEditorDialog
        onOpenChange={(open) => {
          if (!open) {
            setTaskEditorTarget(null);
          }
        }}
        onSubmit={submitTaskEditor}
        target={taskEditorTarget}
      />
      <ConnectionDialog
        components={toBoardComponents(agents, eventTriggers)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingConnection(null);
            setConnectionDraft(null);
          }
        }}
        onSubmit={submitConnection}
        pendingConnection={pendingConnection}
      />
      <EditConnectionDialog
        components={toBoardComponents(
          agents.filter((agent) => agent.areaId === editingConnection?.areaId),
          eventTriggers.filter(
            (trigger) => trigger.areaId === editingConnection?.areaId,
          ),
        )}
        connection={editingConnection}
        onOpenChange={(open) => {
          if (!open) {
            setEditingConnection(null);
          }
        }}
        onSubmit={submitConnectionEdit}
      />
      <AgentConfigureDialog
        defaultModelId={defaultModelId}
        models={models}
        onOpenChange={(open) => {
          if (!open) {
            setAgentConfigTarget(null);
          }
        }}
        onSubmit={submitAgentConfigure}
        target={agentConfigTarget}
        templates={templates}
      />
      <EventTriggerConfigureDialog
        onOpenChange={(open) => {
          if (!open) {
            setEventTriggerConfigTarget(null);
          }
        }}
        onSubmit={submitEventTriggerConfigure}
        target={eventTriggerConfigTarget}
      />
    </ConsoleLayout>
  );
}

function AccessDenied() {
  return (
    <div className="grid min-h-0 flex-1 place-items-center p-6">
      <section className="w-full max-w-lg rounded-lg border border-hairline bg-surface-1 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-hairline bg-canvas text-ink-muted">
            <MousePointer2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-medium">Admin access required</h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">
              Whiteboard orchestration is hidden from non-admin users.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function TaskOverview({
  agents,
  areas,
  broadcastDrafts,
  isBroadcasting,
  lastBroadcast,
  onArchiveTask,
  onBroadcast,
  onBroadcastDraftChange,
  onOpen,
  onOpenSession,
  onTaskEdit,
}: {
  agents: WhiteboardAgent[];
  areas: TaskArea[];
  broadcastDrafts: Record<string, string>;
  isBroadcasting: boolean;
  lastBroadcast: { areaId: string; deliveredAt: string; targetCount: number } | null;
  onArchiveTask: (areaId: string) => void;
  onBroadcast: (areaId: string) => void;
  onBroadcastDraftChange: (areaId: string, value: string) => void;
  onOpen: (areaId: string, selectedAgentId?: string) => void;
  onOpenSession: (sessionId: string) => void;
  onTaskEdit: (area: TaskArea) => void;
}) {
  const activeAreas = areas.filter((area) => !area.archivedAt);
  const archivedAreas = areas.filter((area) => area.archivedAt);

  return (
    <section className="min-h-0 flex-1 overflow-auto p-5">
      <div className="mx-auto grid max-w-6xl gap-5">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-medium">Tasks</h2>
            <div className="mt-1 text-sm text-ink-muted">
              Planner lanes, support status, and broadcast controls.
            </div>
          </div>
          <Badge>{activeAreas.length} active</Badge>
        </div>

        <div className="grid overflow-hidden rounded-lg border border-hairline bg-surface-1">
          {activeAreas.map((area) => {
          const areaAgents = agents.filter((agent) => agent.areaId === area.id);
          const sortedAgents = sortOverviewAgents(areaAgents);
          const helpCount = areaAgents.filter(
            (agent) => agent.status === "needs_help",
          ).length;
          const doneCount = areaAgents.filter(
            (agent) => agent.status === "done",
          ).length;
          const broadcastDraft = broadcastDrafts[area.id] ?? "";
          const areaLastBroadcast =
            lastBroadcast?.areaId === area.id ? lastBroadcast : null;
          return (
            <TaskBoardRow
              agents={sortedAgents}
              area={area}
              broadcastDraft={broadcastDraft}
              doneCount={doneCount}
              helpCount={helpCount}
              isBroadcasting={isBroadcasting}
              key={area.id}
              lastBroadcast={areaLastBroadcast}
              onArchiveTask={onArchiveTask}
              onBroadcast={onBroadcast}
              onBroadcastDraftChange={onBroadcastDraftChange}
              onOpen={onOpen}
              onOpenSession={onOpenSession}
              onTaskEdit={onTaskEdit}
              totalCount={areaAgents.length}
            />
          );
        })}
          {activeAreas.length === 0 && (
            <div className="p-4">
              <EmptyMini label="No active tasks" />
            </div>
          )}
        </div>

        {archivedAreas.length > 0 && (
          <section className="grid gap-2">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-ink-tertiary">
              <Archive className="h-3.5 w-3.5" />
              Archived
            </div>
            <div className="grid overflow-hidden rounded-lg border border-hairline bg-surface-1">
              {archivedAreas.map((area) => (
                <div
                  className="grid gap-1 border-b border-hairline px-4 py-3 last:border-b-0"
                  key={area.id}
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <TruncatedText className="text-sm font-medium">
                      {area.name}
                    </TruncatedText>
                    <Badge>archived</Badge>
                  </div>
                  <TruncatedText className="text-sm text-ink-muted">
                    {area.description}
                  </TruncatedText>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </section>
  );
}

function TaskBoardRow({
  agents,
  area,
  broadcastDraft,
  doneCount,
  helpCount,
  isBroadcasting,
  lastBroadcast,
  onArchiveTask,
  onBroadcast,
  onBroadcastDraftChange,
  onOpen,
  onOpenSession,
  onTaskEdit,
  totalCount,
}: {
  agents: WhiteboardAgent[];
  area: TaskArea;
  broadcastDraft: string;
  doneCount: number;
  helpCount: number;
  isBroadcasting: boolean;
  lastBroadcast: {
    areaId: string;
    deliveredAt: string;
    targetCount: number;
  } | null;
  onArchiveTask: (areaId: string) => void;
  onBroadcast: (areaId: string) => void;
  onBroadcastDraftChange: (areaId: string, value: string) => void;
  onOpen: (areaId: string, selectedAgentId?: string) => void;
  onOpenSession: (sessionId: string) => void;
  onTaskEdit: (area: TaskArea) => void;
  totalCount: number;
}) {
  return (
    <article className="grid gap-3 border-b border-hairline p-4 last:border-b-0">
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <button
          className="grid min-w-0 gap-1 text-left"
          onClick={() => onOpen(area.id)}
          type="button"
        >
          <div className="flex min-w-0 items-center gap-2">
            <TruncatedText className="text-base font-medium">
              {area.name}
            </TruncatedText>
            <TaskStatusBadge
              doneCount={doneCount}
              helpCount={helpCount}
              totalCount={totalCount}
            />
          </div>
          <TruncatedText className="text-sm text-ink-muted">
            {area.description}
          </TruncatedText>
          <div className="text-xs text-ink-tertiary">
            {totalCount} agents / {doneCount} done / {helpCount} need support
          </div>
        </button>
        <div className="flex flex-wrap items-start justify-end gap-2">
          <Button
            icon={<Route className="h-4 w-4" />}
            onClick={() => onOpenSession(area.planner.sessionId)}
            size="sm"
            type="button"
            variant="secondary"
          >
            Go to planner
          </Button>
          <Button
            icon={<Settings2 className="h-4 w-4" />}
            onClick={() => onTaskEdit(area)}
            size="sm"
            type="button"
            variant="ghost"
          >
            Edit
          </Button>
          <Button
            icon={<Archive className="h-4 w-4" />}
            onClick={() => onArchiveTask(area.id)}
            size="sm"
            type="button"
            variant="danger"
          >
            Archive
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,360px)]">
        <div className="grid gap-2 rounded-lg border border-hairline bg-canvas p-3">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-ink-tertiary">
            <Megaphone className="h-3.5 w-3.5" />
            Planner broadcast
          </div>
          <textarea
            className="min-h-16 resize-none rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm leading-6 text-ink outline-none transition placeholder:text-ink-tertiary focus:border-primary-focus"
            onChange={(event) =>
              onBroadcastDraftChange(area.id, event.target.value)
            }
            placeholder="Broadcast through planner"
            value={broadcastDraft}
          />
          {lastBroadcast && (
            <div className="text-xs text-ink-tertiary">
              Delivered to {lastBroadcast.targetCount} at{" "}
              {new Date(lastBroadcast.deliveredAt).toLocaleTimeString()}
            </div>
          )}
          <div className="flex justify-end">
            <Button
              disabled={
                isBroadcasting || totalCount === 0 || !broadcastDraft.trim()
              }
              icon={<Send className="h-4 w-4" />}
              onClick={() => onBroadcast(area.id)}
              size="sm"
              type="button"
              variant="primary"
            >
              {isBroadcasting ? "Sending..." : "Broadcast"}
            </Button>
          </div>
        </div>

        <div className="grid gap-2 rounded-lg border border-hairline bg-canvas p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium uppercase tracking-[0.08em] text-ink-tertiary">
              Agents
            </div>
            <Badge>{totalCount}</Badge>
          </div>
          <div className="grid max-h-56 gap-1.5 overflow-auto">
            {agents.map((agent) => (
              <button
                className={cn(
                  "flex min-w-0 items-center gap-2 rounded-lg border border-hairline bg-canvas px-2 py-1.5 text-left transition hover:border-primary-focus hover:bg-surface-2",
                  agent.status === "needs_help" && "bg-warning/10",
                  agent.status === "done" && "bg-success/10",
                )}
                key={agent.id}
                onClick={() => onOpenSession(agent.sessionId)}
                type="button"
              >
                {agent.status === "needs_help" ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                ) : (
                  <Bot className="h-4 w-4 shrink-0 text-ink-tertiary" />
                )}
                <span className="min-w-0 flex-1">
                  <TruncatedText className="text-sm font-medium">
                    {agent.name}
                  </TruncatedText>
                  <TruncatedText className="text-xs text-ink-tertiary">
                    {agent.goal}
                  </TruncatedText>
                </span>
                <Badge tone={agentStatusTone(agent.status)}>
                  {agentStatusLabel(agent.status)}
                </Badge>
              </button>
            ))}
            {agents.length === 0 && <EmptyMini label="No agents initialized" />}
          </div>
        </div>
      </div>
    </article>
  );
}

function TaskStatusBadge({
  doneCount,
  helpCount,
  totalCount,
}: {
  doneCount: number;
  helpCount: number;
  totalCount: number;
}) {
  if (helpCount > 0) {
    return <Badge tone="warning">needs support</Badge>;
  }
  if (totalCount > 0 && doneCount === totalCount) {
    return <Badge tone="success">done</Badge>;
  }
  return <Badge>{totalCount > 0 ? "active" : "empty"}</Badge>;
}

function ComponentPalette({
  isLoading,
  onAddAgent,
  onAddEventTrigger,
  onCollapse,
}: {
  isLoading: boolean;
  onAddAgent: () => void;
  onAddEventTrigger: () => void;
  onCollapse: () => void;
}) {
  return (
    <aside className="min-h-0 overflow-auto bg-surface-1 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-[0.08em] text-ink-tertiary">
          Components
        </div>
        <div className="flex items-center gap-1.5">
          <Badge>2</Badge>
          <Button
            icon={<X className="h-3.5 w-3.5" />}
            onClick={onCollapse}
            size="icon"
            tooltip="Collapse components"
            type="button"
            variant="ghost"
          />
        </div>
      </div>
      <div className="grid gap-2">
        <div className="text-xs font-medium uppercase tracking-[0.08em] text-ink-tertiary">
          Agent session
        </div>
        {isLoading && <EmptyMini label="Loading components" />}
        <button
          className="grid min-h-[92px] cursor-grab gap-2 rounded-lg border border-hairline bg-canvas p-3 text-left transition hover:border-hairline-strong hover:bg-surface-2 active:cursor-grabbing"
          draggable
          onClick={onAddAgent}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "copyMove";
            event.dataTransfer.setData(
              agentTemplateMimeType,
              registeredAgentComponentId,
            );
          }}
          type="button"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Bot className="h-4 w-4 shrink-0 text-ink-muted" />
            <TruncatedText className="text-sm font-medium">
              Agent
            </TruncatedText>
          </span>
          <span className="line-clamp-2 text-xs leading-5 text-ink-subtle">
            Select one of your registered agents during configuration.
          </span>
        </button>
        <div className="mt-3 text-xs font-medium uppercase tracking-[0.08em] text-ink-tertiary">
          Event triggers
        </div>
        <button
          className="grid min-h-[104px] cursor-grab gap-2 rounded-lg border border-hairline bg-canvas p-3 text-left transition hover:border-hairline-strong hover:bg-surface-2 active:cursor-grabbing"
          draggable
          onClick={onAddEventTrigger}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "copyMove";
            event.dataTransfer.setData(eventTriggerMimeType, "event-trigger");
          }}
          type="button"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Zap className="h-4 w-4 shrink-0 text-warning" />
            <TruncatedText className="text-sm font-medium">
              Event trigger
            </TruncatedText>
          </span>
          <span className="line-clamp-2 text-xs leading-5 text-ink-subtle">
            Python condition that decides when to call into the task.
          </span>
        </button>
      </div>
    </aside>
  );
}

function TaskWorkspace({
  agents,
  area,
  connectionDraft,
  connections,
  draggingComponentId,
  eventTriggers,
  onAgentClick,
  onAutoLayout,
  onConnectionCancel,
  onConnectionDraftMove,
  onConnectionEnd,
  onConnectionSelect,
  onConnectionStart,
  onDropAgent,
  onDropEventTrigger,
  onDragComponentEnd,
  onDragComponentStart,
  onMoveComponent,
  onTriggerClick,
  onZoomChange,
  selectedAgentId,
  selectedConnectionId,
  selectedTriggerId,
  templates,
  zoom,
}: {
  agents: WhiteboardAgent[];
  area: TaskArea;
  connectionDraft: ConnectionDraft | null;
  connections: AgentConnection[];
  draggingComponentId: string | null;
  eventTriggers: WhiteboardEventTrigger[];
  onAgentClick: (
    agent: WhiteboardAgent,
    event: MouseEvent<HTMLElement>,
  ) => void;
  onAutoLayout: () => void;
  onConnectionDraftMove: (x: number, y: number) => void;
  onConnectionCancel: () => void;
  onConnectionEnd: (agentId: string) => void;
  onConnectionSelect: (connectionId: string) => void;
  onConnectionStart: (component: BoardComponent, side: ConnectorSide) => void;
  onDropAgent: (templateId: string, event: DragEvent<HTMLElement>) => void;
  onDropEventTrigger: (event: DragEvent<HTMLElement>) => void;
  onDragComponentEnd: () => void;
  onDragComponentStart: (componentId: string) => void;
  onMoveComponent: (componentId: string, event: DragEvent<HTMLElement>) => void;
  onTriggerClick: (
    trigger: WhiteboardEventTrigger,
    event: MouseEvent<HTMLElement>,
  ) => void;
  onZoomChange: (zoom: number) => void;
  selectedAgentId: string | null;
  selectedConnectionId: string | null;
  selectedTriggerId: string | null;
  templates: WhiteboardAgentTemplate[];
  zoom: number;
}) {
  const components = toBoardComponents(agents, eventTriggers);

  return (
    <section className="flex min-h-0 flex-col border-x border-hairline bg-canvas">
      <div className="flex min-w-0 items-center justify-between gap-3 border-b border-hairline p-3">
        <div className="min-w-0">
          <TruncatedText className="text-sm font-medium">
            {area.description}
          </TruncatedText>
          <div className="mt-1 text-xs text-ink-tertiary">
            Click or drag components to place them. Existing components can be
            dragged again.
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            icon={<Sparkles className="h-4 w-4" />}
            onClick={onAutoLayout}
            size="sm"
            tooltip="Auto arrange components"
            type="button"
          >
            Auto layout
          </Button>
          <Button
            icon={<ZoomOut className="h-4 w-4" />}
            onClick={() => onZoomChange(zoom - 0.1)}
            size="icon"
            tooltip="Zoom out"
            type="button"
            variant="ghost"
          />
          <Badge>{Math.round(zoom * 100)}%</Badge>
          <Button
            icon={<ZoomIn className="h-4 w-4" />}
            onClick={() => onZoomChange(zoom + 0.1)}
            size="icon"
            tooltip="Zoom in"
            type="button"
            variant="ghost"
          />
          <Button
            icon={<Maximize2 className="h-4 w-4" />}
            onClick={() => onZoomChange(0.8)}
            size="icon"
            tooltip="Fit view"
            type="button"
            variant="ghost"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <article
          className="relative origin-top-left overflow-hidden rounded-lg border border-hairline bg-surface-1"
          onClick={() => undefined}
          onDragOver={(event) => {
            event.preventDefault();
            const isNewComponent =
              event.dataTransfer.types.includes(agentTemplateMimeType) ||
              event.dataTransfer.types.includes(eventTriggerMimeType);
            event.dataTransfer.dropEffect = isNewComponent ? "copy" : "move";
          }}
          onMouseMove={(event) => {
            if (!connectionDraft) {
              return;
            }
            const bounds = event.currentTarget.getBoundingClientRect();
            onConnectionDraftMove(
              (event.clientX - bounds.left) / zoom,
              (event.clientY - bounds.top) / zoom,
            );
          }}
          onMouseUp={() => {
            if (connectionDraft) {
              onConnectionCancel();
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            const templateId = event.dataTransfer.getData(agentTemplateMimeType);
            const agentId = event.dataTransfer.getData(existingAgentMimeType);
            const triggerId = event.dataTransfer.getData(
              existingEventTriggerMimeType,
            );
            if (agentId) {
              onMoveComponent(agentId, event);
              return;
            }
            if (triggerId) {
              onMoveComponent(triggerId, event);
              return;
            }
            if (templateId) {
              onDropAgent(templateId, event);
              return;
            }
            if (event.dataTransfer.getData(eventTriggerMimeType)) {
              onDropEventTrigger(event);
            }
          }}
          style={{
            height: boardHeight,
            transform: `scale(${zoom})`,
            width: boardWidth,
          }}
        >
          <div className="absolute inset-0 bg-[linear-gradient(var(--hairline)_1px,transparent_1px),linear-gradient(90deg,var(--hairline)_1px,transparent_1px)] bg-[size:32px_32px] opacity-30" />
          <ConnectionLayer
            components={components}
            connectionDraft={connectionDraft}
            connections={connections}
            onSelectConnection={onConnectionSelect}
            selectedConnectionId={selectedConnectionId}
          />
          {components.length === 0 && (
            <div className="absolute left-6 top-6 rounded-lg border border-dashed border-hairline bg-canvas px-3 py-2 text-sm text-ink-tertiary">
              Click or drop a component here
            </div>
          )}
          {agents.map((agent) => {
            const template = templates.find(
              (candidate) => candidate.id === agent.templateId,
            );
            const selected = selectedAgentId === agent.id;
            return (
              <div
                className={cn(
                  "group absolute z-20 grid w-[180px] cursor-grab gap-2 rounded-lg border bg-canvas p-3 text-left shadow-lg shadow-black/20 transition hover:border-hairline-strong active:cursor-grabbing",
                  selected ? "border-primary-focus" : "border-hairline",
                  draggingComponentId === agent.id && "opacity-0",
                )}
                draggable
                key={agent.id}
                onClick={(event) => onAgentClick(agent, event)}
                onDragEnd={onDragComponentEnd}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData(existingAgentMimeType, agent.id);
                  onDragComponentStart(agent.id);
                }}
                style={{ left: agent.x, top: agent.y }}
                tabIndex={0}
              >
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <Bot className="h-4 w-4 shrink-0 text-ink-muted" />
                    <TruncatedText className="text-sm font-medium">
                      {agent.name}
                    </TruncatedText>
                  </span>
                  {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
                </span>
                <TruncatedText className="text-xs text-ink-subtle">
                  {template?.label ?? agent.templateId} / {agent.modelId}
                </TruncatedText>
                <MonoId tooltip={agent.sessionId}>{agent.sessionId}</MonoId>
                <Badge tone={agentStatusTone(agent.status)}>
                  {agentStatusLabel(agent.status)}
                </Badge>
                <ConnectorDots
                  component={toBoardComponent(agent, "agent")}
                  onConnectionEnd={onConnectionEnd}
                  onConnectionStart={onConnectionStart}
                />
              </div>
            );
          })}
          {eventTriggers.map((trigger) => {
            const selected = selectedTriggerId === trigger.id;
            return (
              <div
                className={cn(
                  "group absolute z-20 grid w-[180px] cursor-grab gap-2 rounded-lg border bg-canvas p-3 text-left shadow-lg shadow-black/20 transition hover:border-hairline-strong active:cursor-grabbing",
                  selected ? "border-primary-focus" : "border-hairline",
                  draggingComponentId === trigger.id && "opacity-0",
                )}
                draggable
                key={trigger.id}
                onClick={(event) => onTriggerClick(trigger, event)}
                onDragEnd={onDragComponentEnd}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData(
                    existingEventTriggerMimeType,
                    trigger.id,
                  );
                  onDragComponentStart(trigger.id);
                }}
                style={{ left: trigger.x, top: trigger.y }}
                tabIndex={0}
              >
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <Zap className="h-4 w-4 shrink-0 text-warning" />
                    <TruncatedText className="text-sm font-medium">
                      {trigger.name}
                    </TruncatedText>
                  </span>
                  {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
                </span>
                <TruncatedText className="text-xs text-ink-subtle">
                  {trigger.description || eventTriggerModeLabel(trigger)}
                </TruncatedText>
                <div className="flex items-center gap-1.5 text-xs text-ink-tertiary">
                  {trigger.triggerMode === "scheduled" ? (
                    <Route className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <Code2 className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="truncate">
                    {eventTriggerModeLabel(trigger)}
                  </span>
                </div>
                <ConnectorDots
                  component={toBoardComponent(trigger, "event_trigger")}
                  onConnectionEnd={onConnectionEnd}
                  onConnectionStart={onConnectionStart}
                />
              </div>
            );
          })}
        </article>
      </div>
    </section>
  );
}

function ConnectionLayer({
  components,
  connectionDraft,
  connections,
  onSelectConnection,
  selectedConnectionId,
}: {
  components: BoardComponent[];
  connectionDraft: ConnectionDraft | null;
  connections: AgentConnection[];
  onSelectConnection: (connectionId: string) => void;
  selectedConnectionId: string | null;
}) {
  const byId = new Map(components.map((component) => [component.id, component]));

  return (
    <svg className="absolute inset-0 z-0 h-full w-full">
      <defs>
        <marker
          id="whiteboard-arrow"
          markerHeight="8"
          markerWidth="8"
          orient="auto"
          refX="7"
          refY="4"
          viewBox="0 0 8 8"
        >
          <path d="M0,0 L8,4 L0,8 Z" fill="var(--primary-focus)" />
        </marker>
        <marker
          id="whiteboard-arrow-selected"
          markerHeight="8"
          markerWidth="8"
          orient="auto"
          refX="7"
          refY="4"
          viewBox="0 0 8 8"
        >
          <path d="M0,0 L8,4 L0,8 Z" fill="var(--warning)" />
        </marker>
      </defs>
      {connections.map((connection) => {
        const from = byId.get(connection.fromAgentId);
        const to = byId.get(connection.toAgentId);
        if (!from || !to) {
          return null;
        }
        const start = componentPoint(from, "right");
        const end = componentPoint(to, "left");
        const labelX = (start.x + end.x) / 2;
        const labelY = (start.y + end.y) / 2 - 8;
        const selected = selectedConnectionId === connection.id;
        return (
          <g
            className="cursor-pointer"
            key={connection.id}
            onClick={(event) => {
              event.stopPropagation();
              onSelectConnection(connection.id);
            }}
          >
            <line
              className="pointer-events-stroke"
              stroke="transparent"
              strokeLinecap="round"
              strokeWidth="14"
              x1={start.x}
              x2={end.x}
              y1={start.y}
              y2={end.y}
            />
            <line
              markerEnd={
                connection.direction === "forward" ||
                connection.direction === "bidirectional"
                  ? selected
                    ? "url(#whiteboard-arrow-selected)"
                    : "url(#whiteboard-arrow)"
                  : undefined
              }
              markerStart={
                connection.direction === "reverse" ||
                connection.direction === "bidirectional"
                  ? selected
                    ? "url(#whiteboard-arrow-selected)"
                    : "url(#whiteboard-arrow)"
                  : undefined
              }
              stroke={selected ? "var(--warning)" : "var(--primary-focus)"}
              strokeWidth={selected ? "3" : "2"}
              x1={start.x}
              x2={end.x}
              y1={start.y}
              y2={end.y}
            />
            <text
              className="pointer-events-none fill-ink-muted text-[11px]"
              textAnchor="middle"
              x={labelX}
              y={labelY}
            >
              {connection.label}
            </text>
          </g>
        );
      })}
      {connectionDraft &&
        (() => {
          const from = byId.get(connectionDraft.fromAgentId);
          if (!from) {
            return null;
          }
          const start = componentPoint(from, connectionDraft.fromSide);
          return (
            <line
              stroke="var(--warning)"
              strokeDasharray="5 5"
              strokeWidth="2"
              x1={start.x}
              x2={connectionDraft.x}
              y1={start.y}
              y2={connectionDraft.y}
            />
          );
        })()}
    </svg>
  );
}

function ConnectorDots({
  component,
  onConnectionEnd,
  onConnectionStart,
}: {
  component: BoardComponent;
  onConnectionEnd: (agentId: string) => void;
  onConnectionStart: (component: BoardComponent, side: ConnectorSide) => void;
}) {
  const sides: ConnectorSide[] = ["top", "right", "bottom", "left"];
  return (
    <>
      {sides.map((side) => (
        <button
          aria-label={`Connect ${component.name} from ${side}`}
          className={cn(
            "absolute z-30 h-3 w-3 rounded-full border border-primary-focus bg-canvas opacity-0 shadow shadow-black/30 transition group-hover:opacity-100",
            connectorDotClass(side),
          )}
          key={side}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onConnectionStart(component, side);
          }}
          onMouseUp={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onConnectionEnd(component.id);
          }}
          type="button"
        />
      ))}
    </>
  );
}

function componentPoint(component: BoardComponent, side: ConnectorSide) {
  if (side === "top") {
    return { x: component.x + 90, y: component.y };
  }
  if (side === "right") {
    return { x: component.x + 180, y: component.y + 54 };
  }
  if (side === "bottom") {
    return { x: component.x + 90, y: component.y + 108 };
  }
  return { x: component.x, y: component.y + 54 };
}

function connectorDotClass(side: ConnectorSide) {
  if (side === "top") {
    return "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2";
  }
  if (side === "right") {
    return "right-0 top-1/2 -translate-y-1/2 translate-x-1/2";
  }
  if (side === "bottom") {
    return "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2";
  }
  return "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2";
}

function InspectorPanel({
  agents,
  eventTriggers,
  onConfigureAgent,
  onConfigureTrigger,
  onCollapse,
  onDeleteConnection,
  onEditConnection,
  selectedAgent,
  selectedConnection,
  selectedTrigger,
}: {
  agents: WhiteboardAgent[];
  eventTriggers: WhiteboardEventTrigger[];
  onConfigureAgent: (agent: WhiteboardAgent) => void;
  onConfigureTrigger: (trigger: WhiteboardEventTrigger) => void;
  onCollapse: () => void;
  onDeleteConnection: (connectionId: string) => void;
  onEditConnection: (connection: AgentConnection) => void;
  selectedAgent?: WhiteboardAgent;
  selectedConnection: AgentConnection | null;
  selectedTrigger?: WhiteboardEventTrigger;
}) {
  const componentById = new Map(
    toBoardComponents(agents, eventTriggers).map((component) => [
      component.id,
      component,
    ]),
  );
  const selectedFromAgent = selectedConnection
    ? componentById.get(selectedConnection.fromAgentId)
    : undefined;
  const selectedToAgent = selectedConnection
    ? componentById.get(selectedConnection.toAgentId)
    : undefined;

  return (
    <aside className="flex min-h-0 flex-col bg-surface-1">
      <div className="border-b border-hairline p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-ink-tertiary">
            <Route className="h-3.5 w-3.5" />
            Inspector
          </div>
          <Button
            icon={<X className="h-3.5 w-3.5" />}
            onClick={onCollapse}
            size="icon"
            tooltip="Collapse details"
            type="button"
            variant="ghost"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="grid gap-3">
          <section className="grid gap-2 rounded-lg border border-hairline bg-canvas p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium uppercase tracking-[0.08em] text-ink-tertiary">
                Selection
              </div>
              <Badge>
                {selectedConnection
                  ? "relationship"
                  : selectedAgent
                    ? "agent"
                    : selectedTrigger
                      ? "event trigger"
                      : "none"}
              </Badge>
            </div>
            {selectedAgent ? (
              <div className="grid gap-2">
                <TruncatedText className="text-sm font-medium">
                  {selectedAgent.name}
                </TruncatedText>
                <TruncatedText className="text-xs text-ink-muted">
                  {selectedAgent.goal}
                </TruncatedText>
                <div className="grid gap-1 text-xs text-ink-tertiary">
                  <div>Model: {selectedAgent.modelId}</div>
                  <div>Status: {selectedAgent.status}</div>
                  <MonoId tooltip={selectedAgent.sessionId}>
                    {selectedAgent.sessionId}
                  </MonoId>
                </div>
                <Button
                  icon={<Settings2 className="h-4 w-4" />}
                  onClick={() => onConfigureAgent(selectedAgent)}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  Configure
                </Button>
              </div>
            ) : selectedTrigger ? (
              <div className="grid gap-2">
                <TruncatedText className="text-sm font-medium">
                  {selectedTrigger.name}
                </TruncatedText>
                {selectedTrigger.description && (
                  <TruncatedText className="text-xs text-ink-muted">
                    {selectedTrigger.description}
                  </TruncatedText>
                )}
                <Badge>{eventTriggerModeLabel(selectedTrigger)}</Badge>
                {selectedTrigger.triggerMode === "scheduled" ? (
                  <div className="rounded-lg border border-hairline bg-surface-1 p-2 text-xs leading-5 text-ink-muted">
                    {eventTriggerScheduleLabel(selectedTrigger)}
                  </div>
                ) : (
                  <pre className="max-h-40 overflow-auto rounded-lg border border-hairline bg-surface-1 p-2 text-xs leading-5 text-ink-subtle">
                    {selectedTrigger.pythonScript}
                  </pre>
                )}
                {selectedTrigger.lastMatchedAt && (
                  <div className="text-xs text-ink-tertiary">
                    Last matched{" "}
                    {new Date(selectedTrigger.lastMatchedAt).toLocaleString()}
                  </div>
                )}
                <Button
                  icon={<Settings2 className="h-4 w-4" />}
                  onClick={() => onConfigureTrigger(selectedTrigger)}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  Configure
                </Button>
              </div>
            ) : selectedConnection ? (
              <div className="grid gap-2">
                <div className="flex min-w-0 items-center gap-1.5 text-sm text-ink-muted">
                  <TruncatedText className="max-w-28">
                    {selectedFromAgent?.name ?? selectedConnection.fromAgentId}
                  </TruncatedText>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                  <TruncatedText className="max-w-28">
                    {selectedToAgent?.name ?? selectedConnection.toAgentId}
                  </TruncatedText>
                </div>
                <TruncatedText className="text-sm font-medium">
                  {selectedConnection.label}
                </TruncatedText>
                {selectedConnection.kind === "event_trigger" ? (
                  <div className="grid gap-2 rounded-lg border border-hairline bg-surface-1 p-2 text-xs leading-5 text-ink-muted">
                    <div>
                      If output equals{" "}
                      <span className="font-mono text-ink">
                        {selectedConnection.conditionOutput}
                      </span>
                    </div>
                    <div>
                      Trigger with{" "}
                      <span className="font-mono text-ink">
                        {selectedConnection.triggerWith}
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <Badge>{connectionDirectionLabel(selectedConnection)}</Badge>
                    {selectedConnection.description && (
                      <div className="text-xs leading-5 text-ink-muted">
                        {selectedConnection.description}
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-end gap-1.5">
                  <Button
                    icon={<Settings2 className="h-3.5 w-3.5" />}
                    onClick={() => onEditConnection(selectedConnection)}
                    size="icon"
                    tooltip="Edit relationship"
                    type="button"
                    variant="ghost"
                  />
                  <Button
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => onDeleteConnection(selectedConnection.id)}
                    size="icon"
                    tooltip="Delete relationship"
                    type="button"
                    variant="danger"
                  />
                </div>
              </div>
            ) : (
              <div className="text-sm text-ink-tertiary">
                Select an agent or relationship on the canvas.
              </div>
            )}
          </section>

        </div>
      </div>
    </aside>
  );
}

function CollapsedRail({
  icon,
  label,
  onOpen,
}: {
  icon: React.ReactNode;
  label: string;
  onOpen: () => void;
}) {
  return (
    <button
      className="flex min-h-0 flex-col items-center gap-3 border-x border-hairline bg-surface-1 px-2 py-3 text-ink-subtle transition hover:bg-surface-2 hover:text-ink"
      onClick={onOpen}
      type="button"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-hairline bg-canvas">
        {icon}
      </span>
      <span className="[writing-mode:vertical-rl] text-xs font-medium uppercase tracking-[0.08em]">
        {label}
      </span>
    </button>
  );
}

function ConnectionDialog({
  components,
  onOpenChange,
  onSubmit,
  pendingConnection,
}: {
  components: BoardComponent[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  pendingConnection: PendingConnectionConfig | null;
}) {
  const fromComponent = components.find(
    (component) => component.id === pendingConnection?.fromAgentId,
  );
  const toComponent = components.find(
    (component) => component.id === pendingConnection?.toAgentId,
  );
  const eventTriggerConnection = pendingConnection
    ? resolveEventTriggerConnection(
        pendingConnection.fromAgentId,
        pendingConnection.toAgentId,
        components,
      )
    : null;

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={Boolean(pendingConnection)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 grid w-[min(calc(100vw-32px),500px)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-hairline bg-surface-2 p-4 shadow-2xl shadow-black/40 outline-none">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-medium">
                {eventTriggerConnection
                  ? "Configure trigger condition"
                  : "Configure relationship"}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-muted">
                {eventTriggerConnection
                  ? "If the trigger output matches, call the target with the configured input."
                  : "Arrow direction controls information sharing direction."}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                icon={<X className="h-4 w-4" />}
                size="icon"
                tooltip="Close"
                type="button"
                variant="ghost"
              />
            </Dialog.Close>
          </div>

          <form className="grid gap-3" onSubmit={onSubmit}>
            {eventTriggerConnection ? (
              <EventTriggerConnectionFields
                targetName={eventTriggerConnection.target.name}
                triggerName={eventTriggerConnection.trigger.name}
              />
            ) : (
              <>
                <label className="grid gap-2 text-sm text-ink-muted">
                  Direction
                  <select
                    className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
                    defaultValue="forward"
                    name="direction"
                  >
                    <option value="forward">
                      {fromComponent?.name ?? "Source"} shares to{" "}
                      {toComponent?.name ?? "Target"}
                    </option>
                    <option value="reverse">
                      {toComponent?.name ?? "Target"} shares to{" "}
                      {fromComponent?.name ?? "Source"}
                    </option>
                    <option value="bidirectional">
                      {fromComponent?.name ?? "Source"} and{" "}
                      {toComponent?.name ?? "Target"} share both ways
                    </option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm text-ink-muted">
                  Relationship
                  <input
                    className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none placeholder:text-ink-tertiary focus:border-primary-focus"
                    defaultValue="Shares context"
                    name="label"
                    placeholder="Relationship label"
                  />
                </label>
                <label className="grid gap-2 text-sm text-ink-muted">
                  Notes
                  <textarea
                    className="min-h-24 resize-none rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm leading-6 text-ink outline-none placeholder:text-ink-tertiary focus:border-primary-focus"
                    name="description"
                    placeholder="What should flow across this edge?"
                  />
                </label>
              </>
            )}
            <div className="flex justify-end gap-2 border-t border-hairline pt-3">
              <Dialog.Close asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                icon={<ArrowRight className="h-4 w-4" />}
                type="submit"
                variant="primary"
              >
                Connect
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EventTriggerConnectionFields({
  conditionOutput,
  targetName,
  triggerName,
  triggerWith,
}: {
  conditionOutput?: string;
  targetName: string;
  triggerName: string;
  triggerWith?: string;
}) {
  return (
    <>
      <div className="rounded-lg border border-hairline bg-canvas p-3 text-xs leading-5 text-ink-muted">
        <span className="font-medium text-ink">{triggerName}</span> output
        equals x, then trigger{" "}
        <span className="font-medium text-ink">{targetName}</span> with y.
      </div>
      <label className="grid gap-2 text-sm text-ink-muted">
        Output equals
        <input
          className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 font-mono text-sm text-ink outline-none placeholder:text-ink-tertiary focus:border-primary-focus"
          defaultValue={conditionOutput ?? "true"}
          name="conditionOutput"
          placeholder="x"
        />
      </label>
      <label className="grid gap-2 text-sm text-ink-muted">
        Trigger with
        <textarea
          className="min-h-24 resize-none rounded-lg border border-hairline bg-canvas px-3 py-2 font-mono text-sm leading-6 text-ink outline-none placeholder:text-ink-tertiary focus:border-primary-focus"
          defaultValue={triggerWith ?? ""}
          name="triggerWith"
          placeholder="y"
        />
      </label>
    </>
  );
}

function EventTriggerDialog({
  onOpenChange,
  onSubmit,
  pendingPlacement,
}: {
  onOpenChange: (open: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  pendingPlacement: PendingEventTriggerPlacement | null;
}) {
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={Boolean(pendingPlacement)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 grid w-[min(calc(100vw-32px),620px)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-hairline bg-surface-2 p-4 shadow-2xl shadow-black/40 outline-none">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-medium">
                Configure event trigger
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-muted">
                Write Python that returns true when this trigger should call
                into the task.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                icon={<X className="h-4 w-4" />}
                size="icon"
                tooltip="Close"
                type="button"
                variant="ghost"
              />
            </Dialog.Close>
          </div>

          <EventTriggerForm
            submitIcon={<Plus className="h-4 w-4" />}
            submitLabel="Create trigger"
            onSubmit={onSubmit}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TaskEditorDialog({
  onOpenChange,
  onSubmit,
  target,
}: {
  onOpenChange: (open: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  target: TaskEditorTarget | null;
}) {
  const task = target === "new" ? null : target;

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={Boolean(target)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 grid w-[min(calc(100vw-32px),520px)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-hairline bg-surface-2 p-4 shadow-2xl shadow-black/40 outline-none">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-medium">
                {task ? "Edit task" : "New task"}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-muted">
                Tasks group a planner session, agents, and directed
                relationships.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                icon={<X className="h-4 w-4" />}
                size="icon"
                tooltip="Close"
                type="button"
                variant="ghost"
              />
            </Dialog.Close>
          </div>

          <form className="grid gap-3" onSubmit={onSubmit}>
            <label className="grid gap-2 text-sm text-ink-muted">
              Name
              <input
                className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none placeholder:text-ink-tertiary focus:border-primary-focus"
                defaultValue={task?.name ?? ""}
                name="name"
                placeholder="Task name"
              />
            </label>
            <label className="grid gap-2 text-sm text-ink-muted">
              Description
              <textarea
                className="min-h-28 resize-none rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm leading-6 text-ink outline-none placeholder:text-ink-tertiary focus:border-primary-focus"
                defaultValue={task?.description ?? ""}
                name="description"
                placeholder="Describe this task"
              />
            </label>
            <div className="flex justify-end gap-2 border-t border-hairline pt-3">
              <Dialog.Close asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                icon={<Settings2 className="h-4 w-4" />}
                type="submit"
                variant="primary"
              >
                {task ? "Save task" : "Create task"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EditConnectionDialog({
  components,
  connection,
  onOpenChange,
  onSubmit,
}: {
  components: BoardComponent[];
  connection: AgentConnection | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const eventTriggerConnection = connection
    ? resolveEventTriggerConnection(
        connection.fromAgentId,
        connection.toAgentId,
        components,
      )
    : null;
  const eventTriggers = components.filter(
    (component) => component.kind === "event_trigger",
  );
  const regularComponents = components.filter(
    (component) => component.kind === "agent",
  );
  const selectableComponents = eventTriggerConnection
    ? components
    : regularComponents;

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={Boolean(connection)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 grid w-[min(calc(100vw-32px),500px)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-hairline bg-surface-2 p-4 shadow-2xl shadow-black/40 outline-none">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-medium">
                {eventTriggerConnection
                  ? "Edit trigger condition"
                  : "Edit relationship"}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-muted">
                {eventTriggerConnection
                  ? "Event trigger edges only check output equality and trigger a target input."
                  : "Change the source, target, label, or notes for this edge."}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                icon={<X className="h-4 w-4" />}
                size="icon"
                tooltip="Close"
                type="button"
                variant="ghost"
              />
            </Dialog.Close>
          </div>

          <form className="grid gap-3" onSubmit={onSubmit}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm text-ink-muted">
                {eventTriggerConnection ? "Event trigger" : "From"}
                <select
                  className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
                  defaultValue={
                    eventTriggerConnection?.trigger.id ??
                    connection?.fromAgentId
                  }
                  name="fromAgentId"
                >
                  {(eventTriggerConnection
                    ? eventTriggers
                    : selectableComponents
                  ).map((component) => (
                    <option key={component.id} value={component.id}>
                      {component.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm text-ink-muted">
                {eventTriggerConnection ? "Target" : "To"}
                <select
                  className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
                  defaultValue={
                    eventTriggerConnection?.target.id ?? connection?.toAgentId
                  }
                  name="toAgentId"
                >
                  {selectableComponents.map((component) => (
                    <option key={component.id} value={component.id}>
                      {component.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {eventTriggerConnection ? (
              <EventTriggerConnectionFields
                conditionOutput={connection?.conditionOutput}
                targetName={eventTriggerConnection.target.name}
                triggerName={eventTriggerConnection.trigger.name}
                triggerWith={connection?.triggerWith}
              />
            ) : (
              <>
                <label className="grid gap-2 text-sm text-ink-muted">
                  Direction
                  <select
                    className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
                    defaultValue={connection?.direction ?? "forward"}
                    name="direction"
                  >
                    <option value="forward">From to To</option>
                    <option value="reverse">To to From</option>
                    <option value="bidirectional">Bidirectional</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm text-ink-muted">
                  Relationship
                  <input
                    className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none placeholder:text-ink-tertiary focus:border-primary-focus"
                    defaultValue={connection?.label ?? ""}
                    name="label"
                    placeholder="Relationship label"
                  />
                </label>
                <label className="grid gap-2 text-sm text-ink-muted">
                  Notes
                  <textarea
                    className="min-h-24 resize-none rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm leading-6 text-ink outline-none placeholder:text-ink-tertiary focus:border-primary-focus"
                    defaultValue={connection?.description ?? ""}
                    name="description"
                    placeholder="What should flow across this edge?"
                  />
                </label>
              </>
            )}
            <div className="flex justify-end gap-2 border-t border-hairline pt-3">
              <Dialog.Close asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                icon={<Settings2 className="h-4 w-4" />}
                type="submit"
                variant="primary"
              >
                Save relationship
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EventTriggerConfigureDialog({
  onOpenChange,
  onSubmit,
  target,
}: {
  onOpenChange: (open: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  target: EventTriggerConfigTarget | null;
}) {
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={Boolean(target)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 grid w-[min(calc(100vw-32px),620px)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-hairline bg-surface-2 p-4 shadow-2xl shadow-black/40 outline-none">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-medium">
                Configure event trigger
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-muted">
                Update when this component should call into the task.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                icon={<X className="h-4 w-4" />}
                size="icon"
                tooltip="Close"
                type="button"
                variant="ghost"
              />
            </Dialog.Close>
          </div>

          <EventTriggerForm
            onSubmit={onSubmit}
            submitIcon={<Settings2 className="h-4 w-4" />}
            submitLabel="Save trigger"
            trigger={target?.trigger}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EventTriggerForm({
  onSubmit,
  submitIcon,
  submitLabel,
  trigger,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitIcon: React.ReactNode;
  submitLabel: string;
  trigger?: WhiteboardEventTrigger;
}) {
  const [triggerMode, setTriggerMode] = useState<WhiteboardEventTrigger["triggerMode"]>(
    trigger?.triggerMode ?? "python",
  );
  const [scheduleKind, setScheduleKind] = useState<
    NonNullable<WhiteboardEventTrigger["scheduleKind"]>
  >(trigger?.scheduleKind ?? "interval");

  return (
    <form className="grid gap-3" onSubmit={onSubmit}>
      <label className="grid gap-2 text-sm text-ink-muted">
        Name
        <input
          className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none placeholder:text-ink-tertiary focus:border-primary-focus"
          defaultValue={trigger?.name ?? "Event trigger"}
          name="name"
          placeholder="Trigger name"
        />
      </label>
      <label className="grid gap-2 text-sm text-ink-muted">
        Description
        <textarea
          className="min-h-20 resize-none rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm leading-6 text-ink outline-none placeholder:text-ink-tertiary focus:border-primary-focus"
          defaultValue={trigger?.description ?? ""}
          name="description"
          placeholder="What event does this watch?"
        />
      </label>
      <label className="grid gap-2 text-sm text-ink-muted">
        Trigger mode
        <select
          className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
          name="triggerMode"
          onChange={(event) =>
            setTriggerMode(normalizeEventTriggerMode(event.target.value))
          }
          value={triggerMode}
        >
          <option value="python">Python condition</option>
          <option value="scheduled">Scheduled task</option>
        </select>
      </label>
      {triggerMode === "scheduled" ? (
        <>
          <label className="grid gap-2 text-sm text-ink-muted">
            Schedule
            <select
              className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
              name="scheduleKind"
              onChange={(event) =>
                setScheduleKind(normalizeScheduleKind(event.target.value))
              }
              value={scheduleKind}
            >
              <option value="interval">Every N minutes</option>
              <option value="cron">Cron expression</option>
            </select>
          </label>
          {scheduleKind === "interval" ? (
            <label className="grid gap-2 text-sm text-ink-muted">
              Interval minutes
              <input
                className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none placeholder:text-ink-tertiary focus:border-primary-focus"
                defaultValue={trigger?.intervalMinutes ?? 15}
                min={1}
                name="intervalMinutes"
                type="number"
              />
            </label>
          ) : (
            <label className="grid gap-2 text-sm text-ink-muted">
              Cron expression
              <input
                className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 font-mono text-sm text-ink outline-none placeholder:text-ink-tertiary focus:border-primary-focus"
                defaultValue={trigger?.cronExpression ?? "*/15 * * * *"}
                name="cronExpression"
                placeholder="*/15 * * * *"
              />
            </label>
          )}
          <label className="grid gap-2 text-sm text-ink-muted">
            Timezone
            <input
              className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none placeholder:text-ink-tertiary focus:border-primary-focus"
              defaultValue={
                trigger?.timezone ??
                Intl.DateTimeFormat().resolvedOptions().timeZone
              }
              name="timezone"
              placeholder="America/Los_Angeles"
            />
          </label>
        </>
      ) : (
        <label className="grid gap-2 text-sm text-ink-muted">
          Python script
          <textarea
            className="min-h-56 resize-none rounded-lg border border-hairline bg-canvas px-3 py-2 font-mono text-xs leading-5 text-ink outline-none placeholder:text-ink-tertiary focus:border-primary-focus"
            defaultValue={trigger?.pythonScript ?? defaultEventTriggerScript}
            name="pythonScript"
            placeholder="def should_trigger(event, state): ..."
            spellCheck={false}
          />
        </label>
      )}
      <div className="flex justify-end gap-2 border-t border-hairline pt-3">
        <Dialog.Close asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </Dialog.Close>
        <Button icon={submitIcon} type="submit" variant="primary">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function AgentConfigureDialog({
  defaultModelId,
  models,
  onOpenChange,
  onSubmit,
  target,
  templates,
}: {
  defaultModelId: string;
  models: { id: string; label: string }[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  target: AgentConfigTarget | null;
  templates: WhiteboardAgentTemplate[];
}) {
  const agent = target?.agent;

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={Boolean(target)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 grid w-[min(calc(100vw-32px),520px)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-hairline bg-surface-2 p-4 shadow-2xl shadow-black/40 outline-none">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-medium">
                Configure agent
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-muted">
                Update the managed session configuration for this task.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                icon={<X className="h-4 w-4" />}
                size="icon"
                tooltip="Close"
                type="button"
                variant="ghost"
              />
            </Dialog.Close>
          </div>

          <form className="grid gap-3" onSubmit={onSubmit}>
            <label className="grid gap-2 text-sm text-ink-muted">
              Agent
              <select
                className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
                defaultValue={agent?.templateId}
                name="templateId"
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm text-ink-muted">
              Model
              <select
                className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
                defaultValue={agent?.modelId ?? defaultModelId}
                name="modelId"
              >
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm text-ink-muted">
              Name
              <input
                className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none placeholder:text-ink-tertiary focus:border-primary-focus"
                defaultValue={agent?.name ?? ""}
                name="name"
                placeholder="Agent name"
              />
            </label>
            <label className="grid gap-2 text-sm text-ink-muted">
              Status
              <select
                className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
                defaultValue={agent?.status ?? "ready"}
                name="status"
              >
                <option value="ready">ready</option>
                <option value="running">running</option>
                <option value="needs_help">needs help</option>
                <option value="done">done</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm text-ink-muted">
              Goal
              <textarea
                className="min-h-28 resize-none rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm leading-6 text-ink outline-none placeholder:text-ink-tertiary focus:border-primary-focus"
                defaultValue={agent?.goal ?? ""}
                name="goal"
                placeholder="Goal"
              />
            </label>
            <div className="flex justify-end gap-2 border-t border-hairline pt-3">
              <Dialog.Close asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                icon={<Settings2 className="h-4 w-4" />}
                type="submit"
                variant="primary"
              >
                Save agent
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function InitializeAgentDialog({
  defaultModelId,
  isPending,
  models,
  onOpenChange,
  onSubmit,
  pendingPlacement,
  templates,
}: {
  defaultModelId: string;
  isPending: boolean;
  models: { id: string; label: string }[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  pendingPlacement: PendingPlacement | null;
  templates: WhiteboardAgentTemplate[];
}) {
  const template =
    templates.find((candidate) => candidate.id === pendingPlacement?.templateId) ??
    templates[0];

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={Boolean(pendingPlacement)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 grid w-[min(calc(100vw-32px),520px)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-hairline bg-surface-2 p-4 shadow-2xl shadow-black/40 outline-none">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-medium">
                Initialize agent
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-muted">
                Configure the managed session before it enters the task.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                disabled={isPending}
                icon={<X className="h-4 w-4" />}
                size="icon"
                tooltip="Close"
                type="button"
                variant="ghost"
              />
            </Dialog.Close>
          </div>

          <form className="grid gap-3" onSubmit={onSubmit}>
            <label className="grid gap-2 text-sm text-ink-muted">
              Agent
              <select
                className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
                defaultValue={template?.id}
                name="templateId"
              >
                {templates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm text-ink-muted">
              Model
              <select
                className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
                defaultValue={defaultModelId}
                name="modelId"
              >
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm text-ink-muted">
              Name
              <input
                className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none placeholder:text-ink-tertiary focus:border-primary-focus"
                defaultValue={template?.defaultName ?? ""}
                name="name"
                placeholder="Agent name"
              />
            </label>
            <label className="grid gap-2 text-sm text-ink-muted">
              Goal
              <textarea
                className="min-h-28 resize-none rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm leading-6 text-ink outline-none placeholder:text-ink-tertiary focus:border-primary-focus"
                name="goal"
                placeholder="Goal"
              />
            </label>
            <div className="flex justify-end gap-2 border-t border-hairline pt-3">
              <Dialog.Close asChild>
                <Button disabled={isPending} type="button" variant="ghost">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                disabled={isPending}
                icon={<Plus className="h-4 w-4" />}
                type="submit"
                variant="primary"
              >
                {isPending ? "Initializing..." : "Initialize"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function agentStatusTone(status: WhiteboardAgent["status"]) {
  if (status === "needs_help") {
    return "warning";
  }
  if (status === "done") {
    return "success";
  }
  return "neutral";
}

function agentStatusLabel(status: WhiteboardAgent["status"]) {
  if (status === "needs_help") {
    return "needs help";
  }

  return status;
}

function registeredAgentTemplates(
  agents: Agent[],
): WhiteboardAgentTemplate[] {
  if (agents.length === 0) {
    return [
      {
        defaultName: "Agent",
        id: registeredAgentComponentId,
        label: "Registered agent",
        summary: "User registered agent",
      },
    ];
  }

  return agents.map((agent) => ({
    defaultName:
      agent.name ?? agent.agent_type ?? agent.hostname ?? "Registered agent",
    id: agent.agent_id,
    label: agent.name ?? agent.agent_type ?? agent.agent_id,
    summary:
      agent.description ??
      ([agent.hostname, agent.status ?? (agent.online ? "online" : undefined)]
        .filter(Boolean)
        .join(" / ") ||
        "Registered agent"),
  }));
}

function parseEventTriggerForm(formData: FormData) {
  const triggerMode = normalizeEventTriggerMode(formData.get("triggerMode"));
  if (triggerMode === "scheduled") {
    const scheduleKind = normalizeScheduleKind(formData.get("scheduleKind"));
    const timezone =
      String(formData.get("timezone") ?? "").trim() ||
      Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (scheduleKind === "cron") {
      const cronExpression = String(
        formData.get("cronExpression") ?? "",
      ).trim();
      if (!cronExpression) {
        return null;
      }

      return {
        cronExpression,
        intervalMinutes: undefined,
        pythonScript: "",
        scheduleKind,
        timezone,
        triggerMode,
      };
    }

    return {
      cronExpression: undefined,
      intervalMinutes: normalizeIntervalMinutes(
        formData.get("intervalMinutes"),
      ),
      pythonScript: "",
      scheduleKind,
      timezone,
      triggerMode,
    };
  }

  const pythonScript = String(formData.get("pythonScript") ?? "").trim();
  if (!pythonScript) {
    return null;
  }

  return {
    cronExpression: undefined,
    intervalMinutes: undefined,
    pythonScript,
    scheduleKind: undefined,
    timezone: undefined,
    triggerMode,
  };
}

function normalizeEventTriggerMode(
  value: FormDataEntryValue | string | null,
): WhiteboardEventTrigger["triggerMode"] {
  return value === "scheduled" ? "scheduled" : "python";
}

function normalizeScheduleKind(
  value: FormDataEntryValue | string | null,
): NonNullable<WhiteboardEventTrigger["scheduleKind"]> {
  return value === "cron" ? "cron" : "interval";
}

function normalizeIntervalMinutes(value: FormDataEntryValue | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 15;
  }

  return Math.round(parsed);
}

function eventTriggerModeLabel(trigger: WhiteboardEventTrigger) {
  if (trigger.triggerMode === "scheduled") {
    return "scheduled task";
  }

  return "python condition";
}

function eventTriggerScheduleLabel(trigger: WhiteboardEventTrigger) {
  if (trigger.scheduleKind === "cron") {
    return `Cron ${trigger.cronExpression ?? "* * * * *"} in ${
      trigger.timezone ?? "local timezone"
    }`;
  }

  return `Every ${trigger.intervalMinutes ?? 15} minutes in ${
    trigger.timezone ?? "local timezone"
  }`;
}

function normalizeConnectionDirection(
  value: FormDataEntryValue | null,
): AgentConnection["direction"] {
  if (value === "reverse" || value === "bidirectional") {
    return value;
  }

  return "forward";
}

function connectionDirectionLabel(connection: AgentConnection) {
  if (connection.direction === "bidirectional") {
    return "bidirectional";
  }
  if (connection.direction === "reverse") {
    return "reverse";
  }

  return "forward";
}

function resolveEventTriggerConnection(
  fromAgentId: string,
  toAgentId: string,
  components: BoardComponent[],
) {
  const from = components.find((component) => component.id === fromAgentId);
  const to = components.find((component) => component.id === toAgentId);
  if (!from || !to) {
    return null;
  }
  if (from.kind === "event_trigger") {
    return {
      target: to,
      trigger: from,
    };
  }
  if (to.kind === "event_trigger") {
    return {
      target: from,
      trigger: to,
    };
  }

  return null;
}

function boardDropPosition(event: DragEvent<HTMLElement>, zoom: number) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: clampBoardPosition((event.clientX - bounds.left) / zoom, boardWidth),
    y: clampBoardPosition((event.clientY - bounds.top) / zoom, boardHeight),
  };
}

function resolveBoardPosition(
  existing: Pick<BoardComponent, "x" | "y">[],
  proposed?: { x: number; y: number },
) {
  if (proposed) {
    const collides = existing.some(
      (component) =>
        Math.abs(component.x - proposed.x) < 180 &&
        Math.abs(component.y - proposed.y) < 120,
    );
    if (!collides) {
      return proposed;
    }
  }

  return nextAgentPosition(existing);
}

function toBoardComponents(
  agents: WhiteboardAgent[],
  triggers: WhiteboardEventTrigger[],
): BoardComponent[] {
  return [
    ...agents.map((agent) => toBoardComponent(agent, "agent")),
    ...triggers.map((trigger) => toBoardComponent(trigger, "event_trigger")),
  ];
}

function toBoardComponent(
  component: Pick<BoardComponent, "areaId" | "id" | "name" | "x" | "y">,
  kind: BoardComponent["kind"],
): BoardComponent {
  return {
    areaId: component.areaId,
    id: component.id,
    kind,
    name: component.name,
    x: component.x,
    y: component.y,
  };
}

function EmptyMini({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-hairline bg-canvas p-3 text-sm text-ink-tertiary">
      {label}
    </div>
  );
}
