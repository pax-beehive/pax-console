"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, Check, Inbox, Send } from "lucide-react";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MonoId, TruncatedText } from "@/components/ui/text";
import {
  acceptEnvelope,
  archiveEnvelope,
  createEnvelope,
  useEnvelopes,
  useFriends,
  useKnowledgeCapsules,
  useNodes,
} from "@/features/api/resources";
import { Envelope, Friend, KnowledgeCapsule, User } from "@/features/api/types";
import { compactId } from "@/lib/format";

type EnvelopesPageClientProps = {
  user: User;
};

type EnvelopeMailbox = "inbox" | "sent" | "archived" | "pending";
type EnvelopeWorkspace = "mailbox" | "compose";

const mailboxFilters: Record<
  EnvelopeMailbox,
  { direction?: string; status?: string }
> = {
  archived: { status: "archived" },
  inbox: { direction: "received" },
  pending: { status: "pending" },
  sent: { direction: "sent" },
};

export function EnvelopesPageClient({ user }: EnvelopesPageClientProps) {
  const queryClient = useQueryClient();
  const nodesQuery = useNodes(user.user_id);
  const nodes = nodesQuery.data?.nodes ?? [];
  const [mailbox, setMailbox] = useState<EnvelopeMailbox>("inbox");
  const [workspace, setWorkspace] = useState<EnvelopeWorkspace>("mailbox");
  const envelopesQuery = useEnvelopes(user.user_id, mailboxFilters[mailbox]);
  const envelopes = envelopesQuery.data?.envelopes ?? [];
  const [selectedEnvelopeId, setSelectedEnvelopeId] = useState<string>();
  const selectedEnvelope =
    envelopes.find((envelope) => envelope.envelope_id === selectedEnvelopeId) ??
    envelopes[0];
  const invalidateEnvelopes = () => {
    void queryClient.invalidateQueries({
      queryKey: ["users", user.user_id, "envelopes"],
    });
    void queryClient.invalidateQueries({
      queryKey: ["users", user.user_id, "knowledge-capsules"],
    });
  };

  return (
    <ConsoleLayout activeNode={nodes[0]} nodes={nodes} user={user}>
      <div className="grid min-h-[calc(100vh-var(--topbar-h))] min-w-0 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="min-w-0 border-b border-hairline bg-surface-1 lg:border-b-0 lg:border-r">
          <header className="border-b border-hairline p-4">
            <div className="flex items-center gap-2 text-xs text-ink-tertiary">
              <Inbox className="h-4 w-4" />
              capsule mail
            </div>
            <h1 className="mt-2 text-2xl font-semibold">Envelopes</h1>
          </header>
          <div className="grid gap-4 p-4">
            <MailboxTabs mailbox={mailbox} onChange={setMailbox} />
            <Button
              icon={<Send className="h-4 w-4" />}
              onClick={() => setWorkspace("compose")}
              type="button"
              variant={workspace === "compose" ? "primary" : "secondary"}
            >
              Compose
            </Button>
            <EnvelopeList
              envelopes={envelopes}
              isLoading={envelopesQuery.isLoading}
              onSelect={(envelopeId) => {
                setSelectedEnvelopeId(envelopeId);
                setWorkspace("mailbox");
              }}
              selectedEnvelopeId={selectedEnvelope?.envelope_id}
            />
          </div>
        </aside>
        <section className="min-w-0 bg-canvas">
          {workspace === "compose" ? (
            <ComposeEnvelopeView
              onCancel={() => setWorkspace("mailbox")}
              onCreated={() => {
                invalidateEnvelopes();
                setWorkspace("mailbox");
              }}
              user={user}
            />
          ) : (
            <EnvelopeDetail
              envelope={selectedEnvelope}
              onChanged={invalidateEnvelopes}
              user={user}
            />
          )}
        </section>
      </div>
    </ConsoleLayout>
  );
}

function MailboxTabs({
  mailbox,
  onChange,
}: {
  mailbox: EnvelopeMailbox;
  onChange: (mailbox: EnvelopeMailbox) => void;
}) {
  return (
    <div className="grid grid-cols-4 overflow-hidden rounded-lg border border-hairline">
      {(["inbox", "sent", "pending", "archived"] as const).map((item) => (
        <button
          className={`min-h-9 border-r border-hairline px-2 text-xs last:border-r-0 ${
            item === mailbox
              ? "bg-surface-2 text-ink"
              : "bg-surface-1 text-ink-subtle hover:bg-surface-2"
          }`}
          key={item}
          onClick={() => onChange(item)}
          type="button"
        >
          {item}
        </button>
      ))}
    </div>
  );
}

function ComposeEnvelopeView({
  onCancel,
  onCreated,
  user,
}: {
  onCancel: () => void;
  onCreated: () => void;
  user: User;
}) {
  const friendsQuery = useFriends(user.user_id, { status: "accepted" });
  const capsulesQuery = useKnowledgeCapsules(user.user_id, { status: "active" });
  const friends = friendsQuery.data?.friends ?? [];
  const capsules = capsulesQuery.data?.capsules ?? [];
  const [friendEmail, setFriendEmail] = useState("");
  const [capsuleId, setCapsuleId] = useState("");
  const [message, setMessage] = useState("");
  const selectedFriendEmail =
    friendEmail || friendRecipientEmail(friends[0], user) || "";
  const selectedCapsule =
    capsules.find((capsule) => capsule.capsule_id === capsuleId) ?? capsules[0];
  const create = useMutation({
    mutationFn: () =>
      createEnvelope(user.user_id, {
        message: message.trim(),
        payload_json: envelopePayload(selectedCapsule),
        recipient_email: selectedFriendEmail,
      }),
    onSuccess: () => {
      setMessage("");
      onCreated();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedFriendEmail && selectedCapsule) {
      create.mutate();
    }
  }

  return (
    <div className="grid min-w-0 gap-5 p-5">
      <header className="flex min-w-0 items-start justify-between gap-4 border-b border-hairline pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-ink-tertiary">
            <Send className="h-4 w-4" />
            compose envelope
          </div>
          <h2 className="mt-2 text-2xl font-semibold">New envelope</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-tertiary">
            Send an active knowledge capsule to an accepted friend.
          </p>
        </div>
        <Button onClick={onCancel} type="button">
          Cancel
        </Button>
      </header>

      <form
        className="grid max-w-3xl gap-4 rounded-lg border border-hairline bg-surface-1 p-4"
        onSubmit={submit}
      >
        <label className="grid gap-2">
          <span className="text-xs text-ink-tertiary">To</span>
          <select
            className="min-h-10 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
            onChange={(event) => setFriendEmail(event.target.value)}
            value={selectedFriendEmail}
          >
            {friends.map((friend) => {
              const email = friendRecipientEmail(friend, user);
              return (
                <option key={friend.friend_id} value={email}>
                  {email}
                </option>
              );
            })}
          </select>
        </label>
        <label className="grid gap-2">
          <span className="text-xs text-ink-tertiary">Capsule payload</span>
          <select
            className="min-h-10 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
            onChange={(event) => setCapsuleId(event.target.value)}
            value={selectedCapsule?.capsule_id ?? ""}
          >
            {capsules.map((capsule) => (
              <option key={capsule.capsule_id} value={capsule.capsule_id}>
                {capsule.title || capsule.keyword}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2">
          <span className="text-xs text-ink-tertiary">Message</span>
          <textarea
            className="min-h-40 resize-none rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-primary-focus"
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Optional note"
            value={message}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={create.isPending || !selectedFriendEmail || !selectedCapsule}
            icon={<Send className="h-4 w-4" />}
            type="submit"
            variant="primary"
          >
            Send envelope
          </Button>
          <Button onClick={onCancel} type="button">
            Discard
          </Button>
        </div>
        {friendsQuery.isLoading && <EmptyState label="Loading friends" />}
        {capsulesQuery.isLoading && <EmptyState label="Loading capsules" />}
        {!friendsQuery.isLoading && friends.length === 0 && (
          <EmptyState label="No accepted friends available" />
        )}
        {!capsulesQuery.isLoading && capsules.length === 0 && (
          <EmptyState label="No active capsules available" />
        )}
        {create.error && <InlineError error={create.error} />}
      </form>
    </div>
  );
}

function EnvelopeList({
  envelopes,
  isLoading,
  onSelect,
  selectedEnvelopeId,
}: {
  envelopes: Envelope[];
  isLoading: boolean;
  onSelect: (envelopeId: string) => void;
  selectedEnvelopeId?: string;
}) {
  if (isLoading) {
    return <EmptyState label="Loading envelopes" />;
  }

  return (
    <section className="grid gap-2">
      <div className="flex min-w-0 items-center justify-between">
        <TruncatedText className="text-sm font-medium">Messages</TruncatedText>
        <Badge className="font-mono">{String(envelopes.length)}</Badge>
      </div>
      <div className="grid overflow-hidden rounded-lg border border-hairline">
        {envelopes.map((envelope) => (
          <button
            className={`grid min-w-0 gap-1 border-b border-hairline px-3 py-2.5 text-left transition last:border-b-0 ${
              envelope.envelope_id === selectedEnvelopeId
                ? "bg-surface-2"
                : "bg-surface-1 hover:bg-surface-2"
            }`}
            key={envelope.envelope_id}
            onClick={() => onSelect(envelope.envelope_id)}
            type="button"
          >
            <div className="flex min-w-0 items-center justify-between gap-3">
              <TruncatedText className="text-sm font-medium">
                {envelope.sender_email}
              </TruncatedText>
              <Badge tone={envelope.status === "pending" ? "warning" : "neutral"}>
                {envelope.status}
              </Badge>
            </div>
            <TruncatedText className="text-xs text-ink-muted">
              to {envelope.recipient_email}
            </TruncatedText>
            <TruncatedText className="text-xs text-ink-tertiary">
              {envelope.message || envelope.payload_type}
            </TruncatedText>
          </button>
        ))}
        {envelopes.length === 0 && <EmptyState label="No envelopes" />}
      </div>
    </section>
  );
}

function EnvelopeDetail({
  envelope,
  onChanged,
  user,
}: {
  envelope?: Envelope;
  onChanged: () => void;
  user: User;
}) {
  const accept = useMutation({
    mutationFn: (envelopeId: string) => acceptEnvelope(user.user_id, envelopeId),
    onSuccess: onChanged,
  });
  const archive = useMutation({
    mutationFn: (envelopeId: string) =>
      archiveEnvelope(user.user_id, envelopeId),
    onSuccess: onChanged,
  });

  if (!envelope) {
    return <div className="p-5"><EmptyState label="Select an envelope" /></div>;
  }

  const isRecipient =
    envelope.recipient_user_id === user.user_id ||
    envelope.recipient_email === user.email;
  const canAccept = isRecipient && envelope.status === "pending";

  return (
    <div className="grid min-w-0 gap-5 p-5">
      <header className="flex min-w-0 items-start justify-between gap-4 border-b border-hairline pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-ink-tertiary">
            <Inbox className="h-4 w-4" />
            envelope detail
          </div>
          <TruncatedText className="mt-2 text-2xl font-semibold">
            {envelope.message || envelope.payload_type}
          </TruncatedText>
          <MonoId className="mt-1" tooltip={envelope.envelope_id}>
            {compactId(envelope.envelope_id)}
          </MonoId>
        </div>
        <Badge>{envelope.status}</Badge>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="grid gap-3">
          <InfoRow label="From" value={envelope.sender_email} />
          <InfoRow label="To" value={envelope.recipient_email} />
          <InfoRow label="Payload" value={envelope.payload_type} />
          <pre className="max-h-[56vh] overflow-auto rounded-lg border border-hairline bg-surface-1 p-3 text-xs leading-6 text-ink-muted">
            {JSON.stringify(envelope.payload_json, null, 2)}
          </pre>
        </section>
        <aside className="grid content-start gap-3">
          <Button
            disabled={!canAccept || accept.isPending}
            icon={<Check className="h-4 w-4" />}
            onClick={() => accept.mutate(envelope.envelope_id)}
            tooltip={
              canAccept
                ? "Accept envelope and unpack capsule"
                : "Only pending received envelopes can be accepted"
            }
            type="button"
            variant="primary"
          >
            Accept
          </Button>
          <Button
            disabled={archive.isPending || envelope.status === "archived"}
            icon={<Archive className="h-4 w-4" />}
            onClick={() => archive.mutate(envelope.envelope_id)}
            type="button"
          >
            Archive
          </Button>
          {accept.error && <InlineError error={accept.error} />}
          {archive.error && <InlineError error={archive.error} />}
        </aside>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-hairline pb-3">
      <div className="text-xs text-ink-tertiary">{label}</div>
      <TruncatedText className="mt-1 text-sm text-ink-muted" tooltip={value}>
        {value}
      </TruncatedText>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-hairline bg-surface-1 p-3 text-sm text-ink-tertiary">
      {label}
    </div>
  );
}

function InlineError({ error }: { error: Error }) {
  return (
    <TruncatedText className="text-xs text-warning">
      {error.name}: {error.message}
    </TruncatedText>
  );
}

function friendRecipientEmail(friend: Friend | undefined, user: User) {
  if (!friend) {
    return "";
  }

  if (friend.requester_user_id === user.user_id) {
    return friend.recipient_email;
  }

  return friend.requester_email;
}

function envelopePayload(capsule: KnowledgeCapsule | undefined) {
  return {
    capsule: {
      content: capsule?.content ?? "",
      keyword: capsule?.keyword ?? "shared",
      original_estimated_chars: capsule?.original_estimated_chars ?? 0,
      source_agent: capsule?.source_agent_id ?? "codex",
      source_node_id: capsule?.source_node_id,
      source_session_id: capsule?.source_session_id,
      summary: capsule?.summary ?? "",
      title: capsule?.title ?? "Shared knowledge capsule",
      truncated: capsule?.truncated ?? false,
    },
    route: {
      match_type: "any",
      match_value: "",
      target_agent: "codex",
    },
    schema_version: "paxl.envelope_payload.knowledge_capsule.v2",
  };
}
