"use client";
import * as Primitive from "@radix-ui/react-popover";
import { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";
export const Popover = Primitive.Root;
export const PopoverTrigger = Primitive.Trigger;
export function PopoverContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={8}
        className={cn(
          "z-50 w-80 max-w-[calc(100vw-24px)] max-h-[70dvh] overflow-y-auto rounded-xl border border-hairline bg-surface-2 p-3 text-ink shadow-xl shadow-black/30 outline-none",
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
}
