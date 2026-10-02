import type { Agent, Health, Node } from "@/features/api/types";
import { isDeviceNode } from "@/components/resources/resource-models";

export type ConnectionState = "Online" | "Offline" | "Unknown";

export function connectionState(
  resource: Pick<Node | Agent, "online" | "status">,
): ConnectionState {
  if (resource.online === true) return "Online";
  if (resource.online === false) return "Offline";
  if (resource.status === "online") return "Online";
  if (resource.status === "offline") return "Offline";
  return "Unknown";
}

export function serviceHealth({
  health,
  nodes,
  agents,
  loading,
  error,
}: {
  health?: Health;
  nodes?: Node[];
  agents?: Agent[];
  loading: boolean;
  error: boolean;
}): {
  title: string;
  description: string;
  tone: "neutral" | "success" | "warning";
} {
  if (loading)
    return {
      title: "Checking status",
      description: "Fetching service and device status.",
      tone: "neutral",
    };
  if (error)
    return {
      title: "Status unavailable",
      description: "Some status checks failed. Open details to retry.",
      tone: "warning",
    };
  const service = health?.status?.toLowerCase();
  if (!service || !nodes || !agents)
    return {
      title: "Status unknown",
      description: "Not all services have reported their status.",
      tone: "neutral",
    };
  if (!["ok", "healthy", "up", "operational"].includes(service))
    return {
      title: "Service needs attention",
      description: `PAX reports: ${health?.status}`,
      tone: "warning",
    };
  const devices = nodes.filter(isDeviceNode);
  const offlineNodes = devices.filter(
    (n) => connectionState(n) === "Offline",
  ).length;
  const offlineAgents = agents.filter(
    (a) => connectionState(a) === "Offline",
  ).length;
  if (offlineNodes || offlineAgents)
    return {
      title: "Some resources are offline",
      description: `${offlineNodes} device(s) and ${offlineAgents} agent(s) offline. PAX is responding.`,
      tone: "warning",
    };
  if ([...devices, ...agents].some((r) => connectionState(r) === "Unknown"))
    return {
      title: "Some status is unknown",
      description:
        "PAX is responding. Some resources have not reported a connection state.",
      tone: "neutral",
    };
  return {
    title:
      devices.length || agents.length
        ? "All systems operational"
        : "PAX is operational",
    description: `${devices.length} device(s) and ${agents.length} agent(s) online.`,
    tone: "success",
  };
}
