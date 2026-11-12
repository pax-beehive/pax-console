"use client";

import { AuthGate } from "@/features/auth/auth-gate";
import { ConsoleLayout } from "@/components/shell/console-layout";
import {
  AgentSignInSettings,
  type AgentSignInProps,
} from "./agent-sign-in-settings";

export function AgentSignInPageClient(props: Omit<AgentSignInProps, "userId">) {
  return (
    <AuthGate>
      {(user) => (
        <ConsoleLayout user={user}>
          <AgentSignInSettings
            key={`${user.user_id}:${props.initialNodeId}:${props.initialHarness}`}
            {...props}
            userId={user.user_id}
          />
        </ConsoleLayout>
      )}
    </AuthGate>
  );
}
