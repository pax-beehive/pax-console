import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Confirms that what the person asked for has happened. Use it when the result
 * would otherwise only be something disappearing from the page.
 */
export function SuccessNotice({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  if (!children) return null;
  return (
    <div
      className={cn(
        "flex min-w-0 items-start gap-2 text-sm text-ink-muted",
        className,
      )}
      role="status"
    >
      <CheckCircle2
        aria-hidden="true"
        className="mt-0.5 h-4 w-4 shrink-0 text-success"
      />
      <p className="min-w-0 break-words">{children}</p>
    </div>
  );
}
