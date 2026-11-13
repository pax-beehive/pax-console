import type { Agent, Health, Node } from "@/features/api/types";
import { translators, type Translator } from "@/features/i18n/translate";
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
  t = translators.en,
  health,
  nodes,
  agents,
  loading,
  error,
}: {
  t?: Translator;
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
      title: t("Checking status"),
      description: t("Fetching service and device status."),
      tone: "neutral",
    };
  if (error)
    return {
      title: t("Status unavailable"),
      description: t("Some status checks failed. Open details to retry."),
      tone: "warning",
    };
  const service = health?.status?.toLowerCase();
  if (!service || !nodes || !agents)
    return {
      title: t("Status unknown"),
      description: t("Not all services have reported their status."),
      tone: "neutral",
    };
  if (!["ok", "healthy", "up", "operational"].includes(service))
    return {
      title: t("Service needs attention"),
      description: t("PAX reports: {status}", { status: health?.status ?? "" }),
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
      title: t("Some resources are offline"),
      description: t(
        "{devices} device(s) and {agents} agent(s) offline. PAX is responding.",
        { devices: offlineNodes, agents: offlineAgents },
      ),
      tone: "warning",
    };
  if ([...devices, ...agents].some((r) => connectionState(r) === "Unknown"))
    return {
      title: t("Some status is unknown"),
      description: t(
        "PAX is responding. Some resources have not reported a connection state.",
      ),
      tone: "neutral",
    };
  return {
    title:
      devices.length || agents.length
        ? t("All systems operational")
        : t("PAX is operational"),
    description: t("{devices} device(s) and {agents} agent(s) online.", {
      devices: devices.length,
      agents: agents.length,
    }),
    tone: "success",
  };
}
