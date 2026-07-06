import { ConversationRouteClient } from "@/components/conversations/conversation-route-client";

export const dynamic = "force-dynamic";

type ConversationPageProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

export default async function ConversationPage({
  params,
}: ConversationPageProps) {
  const { conversationId } = await params;

  return <ConversationRouteClient conversationId={conversationId} />;
}
