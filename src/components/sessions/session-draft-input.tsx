"use client";

import { memo, type ComponentProps } from "react";
import { useConsoleStore } from "@/stores/console-store";
import { SessionCommandInput } from "./session-command-input";

type Props = Omit<
  ComponentProps<typeof SessionCommandInput>,
  "value" | "onValueChange"
> & {
  draftKey: string;
};

// Only the text input subscribes to every character. Parent controls subscribe
// to draft presence and read the latest text at send/queue/steer time.
export const SessionDraftInput = memo(function SessionDraftInput({
  draftKey,
  ...props
}: Props) {
  const value = useConsoleStore(
    (state) => state.composerDrafts[draftKey] ?? "",
  );
  const setDraft = useConsoleStore((state) => state.setComposerDraft);
  return (
    <SessionCommandInput
      {...props}
      value={value}
      onValueChange={(text) => setDraft(draftKey, text)}
    />
  );
});
