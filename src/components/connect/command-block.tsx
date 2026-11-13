"use client";
import { useI18n } from "@/features/i18n/use-i18n";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CommandBlock({ command }: { command: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState("");
  const [error, setError] = useState(false);
  return (
    <div className="grid min-w-0 gap-3">
      <pre className="select-text whitespace-pre-wrap break-all rounded-lg border border-hairline bg-canvas p-3 text-xs leading-6">
        {command}
      </pre>
      <div>
        <Button
          icon={
            copied === command ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )
          }
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(command);
              setCopied(command);
              setError(false);
            } catch {
              setError(true);
            }
          }}
        >
          {copied === command ? t("Copied") : t("Copy command")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-warning">
          {t("Copy is unavailable. Select the command and copy it manually.")}
        </p>
      )}
    </div>
  );
}
