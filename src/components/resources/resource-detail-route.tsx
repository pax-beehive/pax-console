"use client";

import { settingsLinks } from "@/components/settings/settings-catalog";
import { AdministratorRoute } from "@/features/auth/administrator-route";
import { AuthGate } from "@/features/auth/auth-gate";
import {
  AgentDetailPageClient,
  NodeDetailPageClient,
} from "./resource-detail-page-client";

type ResourceDetailRouteProps =
  | {
      kind: "node";
      nodeId: string;
    }
  | {
      agentId: string;
      kind: "agent";
      nodeId?: string;
    };

/**
 * Runtime details of a device or an agent: identifiers, versions, raw
 * metadata and maintenance. They are for administrators; everyone else
 * manages devices and agents from My devices.
 */
export function ResourceDetailRoute(props: ResourceDetailRouteProps) {
  return (
    <AuthGate>
      {(user) => (
        <AdministratorRoute fallbackHref={settingsLinks.devices} user={user}>
          {props.kind === "node" ? (
            <NodeDetailPageClient nodeId={props.nodeId} user={user} />
          ) : (
            <AgentDetailPageClient
              agentId={props.agentId}
              nodeId={props.nodeId}
              user={user}
            />
          )}
        </AdministratorRoute>
      )}
    </AuthGate>
  );
}
