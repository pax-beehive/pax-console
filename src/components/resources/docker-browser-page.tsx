"use client";

import { useI18n } from "@/features/i18n/use-i18n";

import Link from "next/link";
import { useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthGate } from "@/features/auth/auth-gate";
import { useConsoleViewport } from "@/lib/use-console-viewport";
import { NodeBrowserVNC } from "./node-browser-vnc";

export function DockerBrowserRoute({ nodeId }: { nodeId: string }) {
  return (
    <AuthGate>
      {(user) => <DockerBrowserPage nodeId={nodeId} userId={user.user_id} />}
    </AuthGate>
  );
}

function DockerBrowserPage({
  nodeId,
  userId,
}: {
  nodeId: string;
  userId: string;
}) {
  const { t } = useI18n();
  const shellRef = useRef<HTMLElement>(null);
  useConsoleViewport(shellRef);

  return (
    <main
      ref={shellRef}
      aria-label={t("Docker desktop page")}
      className="console-shell flex min-h-0 flex-col overflow-hidden bg-canvas text-ink"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-hairline px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:px-4">
        <Button
          asChild
          icon={<ArrowLeft className="h-4 w-4" />}
          size="sm"
          variant="ghost"
        >
          <Link href={`/nodes/${encodeURIComponent(nodeId)}`}>
            {t("Back to device")}
          </Link>
        </Button>
        <h1 className="min-w-0 truncate text-sm font-medium">
          {t("Docker desktop")}
        </h1>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:px-4">
        <NodeBrowserVNC
          key={`${userId}/${nodeId}`}
          nodeId={nodeId}
          userId={userId}
          layout="page"
        />
      </div>
    </main>
  );
}
