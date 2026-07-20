import { SessionPageClient } from "@/components/sessions/session-page-client";

export const dynamic = "force-dynamic";

export default function NewSessionPage() {
  return <SessionPageClient sessionId="new" />;
}
