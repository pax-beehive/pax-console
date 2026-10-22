import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-ink-tertiary/60",
  success: "bg-success shadow-[0_0_0_3px] shadow-success/15",
  warning: "bg-warning",
};

/** Small presence indicator; the label is announced to screen readers. */
export function StatusDot({
  className,
  label,
  tone = "neutral",
}: {
  className?: string;
  label: string;
  tone?: keyof typeof tones;
}) {
  return (
    <span className={cn("inline-flex shrink-0", className)}>
      <span
        aria-hidden="true"
        className={cn("h-2 w-2 rounded-full", tones[tone])}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
