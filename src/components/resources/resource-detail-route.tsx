"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { settingsLinks } from "@/components/settings/settings-catalog";
import type { User } from "@/features/api/types";
import { canSeeAdminFeatures } from "@/features/auth/admin-view";
import { AuthGate } from "@/features/auth/auth-gate";
import { useConsoleStore } from "@/stores/console-store";
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
        <AdministratorOnly user={user}>
          {props.kind === "node" ? (
            <NodeDetailPageClient nodeId={props.nodeId} user={user} />
          ) : (
            <AgentDetailPageClient
              agentId={props.agentId}
              nodeId={props.nodeId}
              user={user}
            />
          )}
        </AdministratorOnly>
      )}
    </AuthGate>
  );
}

function AdministratorOnly({
  children,
  user,
}: {
  children: ReactNode;
  user: User;
}) {
  const router = useRouter();
  const previewAsUser = useConsoleStore((state) => state.previewAsUser);
  const allowed = canSeeAdminFeatures(user, previewAsUser);
  useEffect(() => {
    if (!allowed) router.replace(settingsLinks.devices);
  }, [allowed, router]);
  return allowed ? children : null;
}
