"use client";

import { useI18n } from "@/features/i18n/use-i18n";
import { Check, Copy } from "lucide-react";
import { Button } from "./button";
import { useCopyFeedback } from "./use-copy-feedback";

/** Icon button that copies `text` and briefly shows a check mark. */
export function CopyTextButton({
  className,
  copiedLabel = "Copied",
  label,
  text,
}: {
  className?: string;
  copiedLabel?: string;
  label: string;
  text: string;
}) {
  const { t } = useI18n();
  const { copied, copy } = useCopyFeedback();
  const currentLabel = copied ? t(copiedLabel) : label;
  return (
    <Button
      aria-label={currentLabel}
      className={className}
      icon={
        copied ? (
          <Check className="h-3.5 w-3.5 text-success" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )
      }
      onClick={() => void copy(text)}
      size="icon"
      tooltip={currentLabel}
      type="button"
      variant="ghost"
    />
  );
}
