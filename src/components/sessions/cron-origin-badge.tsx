import { Badge } from "@/components/ui/badge";
import type { CronSessionOrigin } from "@/features/sessions/session-origin";

export function CronOriginBadge({ origin }: { origin?: CronSessionOrigin }) {
  if (!origin) return null;
  return (
    <Badge
      tooltip={`Scheduled task: ${origin.name}\nCronjob: ${origin.cronjob_id}\nCreated by run: ${origin.run_id}`}
      tone="accent"
    >
      {`Cron: ${origin.name}`}
    </Badge>
  );
}
