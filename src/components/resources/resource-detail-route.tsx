"use client";

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

export function ResourceDetailRoute(props: ResourceDetailRouteProps) {
  return (
    <AuthGate>
      {(user) =>
        props.kind === "node" ? (
          <NodeDetailPageClient nodeId={props.nodeId} user={user} />
        ) : (
          <AgentDetailPageClient
            agentId={props.agentId}
            nodeId={props.nodeId}
            user={user}
          />
        )
      }
    </AuthGate>
  );
}
