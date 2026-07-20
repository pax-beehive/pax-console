import { SessionPageClient } from "@/components/sessions/session-page-client";

export const dynamic = "force-dynamic";

type SessionPageProps = {
  params: Promise<{
    sessionId: string;
  }>;
};

export default async function SessionPage({ params }: SessionPageProps) {
  const { sessionId } = await params;

  return <SessionPageClient sessionId={sessionId} />;
}
