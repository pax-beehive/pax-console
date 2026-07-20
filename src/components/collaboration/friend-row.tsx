"use client";

import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Ban, Check, Pencil, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TruncatedText } from "@/components/ui/text";
import { useFriendInvalidation } from "@/features/api/invalidation";
import {
  acceptFriend,
  blockFriend,
  removeFriend,
  updateFriendAlias,
} from "@/features/api/resources";
import { Friend, User } from "@/features/api/types";

export function friendCounterpartyEmail(friend: Friend, user: User) {
  if (friend.requester_user_id === user.user_id) {
    return friend.recipient_email;
  }
  return friend.requester_email;
}

export function friendAlias(friend: Friend, user: User) {
  if (friend.requester_user_id === user.user_id) {
    return friend.requester_alias;
  }
  return friend.recipient_alias;
}

function friendStatusTone(status: string) {
  switch (status) {
    case "accepted":
      return "success" as const;
    case "blocked":
      return "danger" as const;
    case "pending":
      return "warning" as const;
    default:
      return "neutral" as const;
  }
}

export function FriendRow({ friend, user }: { friend: Friend; user: User }) {
  const invalidateFriends = useFriendInvalidation(user.user_id);
  const alias = friendAlias(friend, user) ?? "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(alias);
  const isReceived =
    friend.recipient_user_id === user.user_id ||
    friend.recipient_email === user.email;
  const isPending = friend.status === "pending";
  const accept = useMutation({
    mutationFn: () => acceptFriend(user.user_id, friend.friend_id, alias),
    onSuccess: invalidateFriends,
  });
  const saveAlias = useMutation({
    mutationFn: () =>
      updateFriendAlias(user.user_id, friend.friend_id, draft.trim()),
    onSuccess: () => {
      invalidateFriends();
      setEditing(false);
    },
  });
  const remove = useMutation({
    mutationFn: () => removeFriend(user.user_id, friend.friend_id),
    onSuccess: invalidateFriends,
  });
  const block = useMutation({
    mutationFn: () => blockFriend(user.user_id, friend.friend_id),
    onSuccess: invalidateFriends,
  });

  function submitAlias(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.trim()) {
      saveAlias.mutate();
    }
  }

  return (
    <article className="grid min-w-0 gap-2 border-b border-hairline bg-surface-1 px-3 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,180px)_auto_auto] sm:items-center sm:gap-3">
      <TruncatedText className="text-sm font-medium">
        {friendCounterpartyEmail(friend, user)}
      </TruncatedText>

      {editing ? (
        <form className="flex min-w-0 gap-1" onSubmit={submitAlias}>
          <input
            autoFocus
            className="min-h-9 min-w-0 flex-1 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink outline-none focus:border-primary-focus"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setDraft(alias);
                setEditing(false);
              }
            }}
            placeholder="Alias"
            value={draft}
          />
          <Button
            disabled={saveAlias.isPending || !draft.trim()}
            icon={<Check className="h-4 w-4" />}
            size="icon"
            tooltip="Save alias"
            type="submit"
            variant="primary"
          />
          <Button
            icon={<X className="h-4 w-4" />}
            onClick={() => {
              setDraft(alias);
              setEditing(false);
            }}
            size="icon"
            tooltip="Cancel"
            type="button"
          />
        </form>
      ) : (
        <button
          className="group flex min-w-0 items-center gap-1.5 text-left"
          onClick={() => {
            setDraft(alias);
            setEditing(true);
          }}
          type="button"
        >
          <TruncatedText
            className={alias ? "text-xs text-ink-muted" : "text-xs"}
          >
            {alias || "Add alias"}
          </TruncatedText>
          <Pencil className="h-3 w-3 shrink-0 text-ink-tertiary opacity-0 transition group-hover:opacity-100" />
        </button>
      )}

      <div className="flex items-center sm:justify-end">
        <Badge tone={friendStatusTone(friend.status)}>{friend.status}</Badge>
      </div>

      <div className="flex items-center gap-1 sm:justify-end">
        {isPending && isReceived && (
          <Button
            disabled={accept.isPending}
            onClick={() => accept.mutate()}
            size="sm"
            type="button"
            variant="primary"
          >
            Accept
          </Button>
        )}
        <Button
          disabled={remove.isPending}
          icon={<Trash2 className="h-4 w-4" />}
          onClick={() => remove.mutate()}
          size="icon"
          tooltip="Remove friend"
          type="button"
        />
        <Button
          disabled={block.isPending}
          icon={<Ban className="h-4 w-4" />}
          onClick={() => block.mutate()}
          size="icon"
          tooltip="Block friend"
          type="button"
          variant="danger"
        />
      </div>
    </article>
  );
}
