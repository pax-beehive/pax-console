"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/features/i18n/use-i18n";
import type { CronSessionOrigin } from "@/features/sessions/session-origin";

export function CronOriginBadge({ origin }: { origin?: CronSessionOrigin }) {
  const { t } = useI18n();
  if (!origin) return null;
  return (
    <Badge
      tooltip={t(
        "Scheduled task: {name}\nCronjob: {cronjob}\nCreated by run: {run}",
        { name: origin.name, cronjob: origin.cronjob_id, run: origin.run_id },
      )}
      tone="accent"
    >
      {t("Cron: {name}", { name: origin.name })}
    </Badge>
  );
}
