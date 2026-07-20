"use client";

import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MailPlus } from "lucide-react";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineError } from "@/components/ui/inline-error";
import { useFriendInvalidation } from "@/features/api/invalidation";
import { createFriend, useFriends } from "@/features/api/resources";
import { User } from "@/features/api/types";
import { AuthGate } from "@/features/auth/auth-gate";
import { FriendRow } from "./friend-row";

export function FriendsPageRoute() {
  return <AuthGate>{(user) => <FriendsPageClient user={user} />}</AuthGate>;
}

export function FriendsPageClient({ user }: { user: User }) {
  const friendsQuery = useFriends(user.user_id);
  const friends = friendsQuery.data?.friends ?? [];

  return (
    <ConsoleLayout user={user}>
      <div className="mx-auto grid w-full max-w-4xl min-w-0 gap-5 p-5">
        <header className="border-b border-hairline pb-4">
          <div className="flex items-center gap-2 text-xs text-accent-bright">
            <MailPlus className="h-4 w-4" />
            friend graph
          </div>
          <h1 className="mt-2 text-2xl font-semibold">Friends</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-tertiary">
            Manage direct trust relationships used for envelope delivery.
          </p>
        </header>

        <FriendRequestForm userId={user.user_id} />

        <section className="grid gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">Friend records</h2>
            <Badge className="min-w-[1.75rem] justify-center font-mono">
              {String(friends.length)}
            </Badge>
          </div>
          {friendsQuery.isLoading && <EmptyState label="Loading friends" />}
          <div className="grid overflow-hidden rounded-lg border border-hairline">
            {friends.map((friend) => (
              <FriendRow friend={friend} key={friend.friend_id} user={user} />
            ))}
            {!friendsQuery.isLoading && friends.length === 0 && (
              <EmptyState label="No friends" />
            )}
          </div>
        </section>
      </div>
    </ConsoleLayout>
  );
}

function FriendRequestForm({ userId }: { userId: string }) {
  const invalidateFriends = useFriendInvalidation(userId);
  const [email, setEmail] = useState("");
  const [alias, setAlias] = useState("");
  const create = useMutation({
    mutationFn: () => createFriend(userId, email.trim(), alias.trim()),
    onSuccess: () => {
      setEmail("");
      setAlias("");
      invalidateFriends();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (email.trim()) {
      create.mutate();
    }
  }

  return (
    <form
      className="grid gap-2 rounded-lg border border-hairline bg-surface-1 p-3"
      onSubmit={submit}
    >
      <label className="text-xs text-ink-tertiary">Create friend request</label>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)_auto]">
        <input
          className="min-h-9 min-w-0 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="friend@example.com"
          type="email"
          value={email}
        />
        <input
          className="min-h-9 min-w-0 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
          onChange={(event) => setAlias(event.target.value)}
          placeholder="Alias"
          value={alias}
        />
        <Button
          disabled={create.isPending || !email.trim()}
          icon={<MailPlus className="h-4 w-4" />}
          type="submit"
          variant="primary"
        >
          Request
        </Button>
      </div>
      {create.error && <InlineError error={create.error} />}
    </form>
  );
}
