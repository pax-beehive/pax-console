import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full min-w-0 rounded-md border border-hairline-strong bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-primary-focus disabled:opacity-50";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, className)} {...props} />;
}
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(control, "min-h-24 resize-y", className)}
      {...props}
    />
  );
}
export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(control, className)} {...props} />;
}
