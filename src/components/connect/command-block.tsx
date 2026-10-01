"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CommandBlock({ command }: { command: string }) {
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
          {copied === command ? "Copied" : "Copy command"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-warning">
          Copy is unavailable. Select the command and copy it manually.
        </p>
      )}
    </div>
  );
}
