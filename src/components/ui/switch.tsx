"use client";
import * as Primitive from "@radix-ui/react-switch";
import { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

export function Switch({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Primitive.Root>) {
  return (
    <Primitive.Root
      className={cn(
        "inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-hairline-strong bg-surface-3 transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <Primitive.Thumb className="pointer-events-none block h-4 w-4 translate-x-0.5 rounded-full bg-ink shadow-sm transition-transform data-[state=checked]:translate-x-4" />
    </Primitive.Root>
  );
}
