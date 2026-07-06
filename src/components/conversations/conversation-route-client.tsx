"use client";

import { AuthGate } from "@/features/auth/auth-gate";
import { ConversationPageClient } from "./conversation-page-client";

type ConversationRouteClientProps = {
  conversationId?: string;
};

export function ConversationRouteClient({
  conversationId,
}: ConversationRouteClientProps) {
  return (
    <AuthGate>
      {(user) => (
        <ConversationPageClient conversationId={conversationId} user={user} />
      )}
    </AuthGate>
  );
}
