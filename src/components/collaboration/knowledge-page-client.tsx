"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, Brain, Search } from "lucide-react";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineError } from "@/components/ui/inline-error";
import { MonoId, TruncatedText } from "@/components/ui/text";
import {
  archiveKnowledgeCapsule,
  useKnowledgeCapsules,
} from "@/features/api/resources";
import { KnowledgeCapsule, User } from "@/features/api/types";
import { compactId } from "@/lib/format";

type KnowledgePageClientProps = {
  user: User;
};

export function KnowledgePageClient({ user }: KnowledgePageClientProps) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("active");
  const [keywordDraft, setKeywordDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [sourceSessionDraft, setSourceSessionDraft] = useState("");
  const [sourceSessionId, setSourceSessionId] = useState("");
  const capsulesQuery = useKnowledgeCapsules(user.user_id, {
    keyword,
    source_session_id: sourceSessionId,
    status,
  });
  const capsules = capsulesQuery.data?.capsules ?? [];
  const [selectedCapsuleId, setSelectedCapsuleId] = useState<string>();
  const selectedCapsule =
    capsules.find((capsule) => capsule.capsule_id === selectedCapsuleId) ??
    capsules[0];
  const invalidateCapsules = () => {
    void queryClient.invalidateQueries({
      queryKey: ["users", user.user_id, "knowledge-capsules"],
    });
  };

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setKeyword(keywordDraft.trim());
    setSourceSessionId(sourceSessionDraft.trim());
  }

  return (
    <ConsoleLayout user={user}>
      <div className="grid min-h-0 min-w-0 flex-1 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="min-w-0 border-b border-hairline bg-surface-1 lg:border-b-0 lg:border-r">
          <header className="border-b border-hairline p-4">
            <div className="flex items-center gap-2 text-xs text-ink-tertiary">
              <Brain className="h-4 w-4" />
              reusable context
            </div>
            <h1 className="mt-2 text-2xl font-semibold">Knowledge</h1>
          </header>
          <div className="grid gap-4 p-4">
            <form className="grid gap-2" onSubmit={applyFilters}>
              <select
                className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
                onChange={(event) => setStatus(event.target.value)}
                value={status}
              >
                <option value="active">active</option>
                <option value="archived">archived</option>
                <option value="">all</option>
              </select>
              <input
                className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
                onChange={(event) => setKeywordDraft(event.target.value)}
                placeholder="Keyword filter"
                value={keywordDraft}
              />
              <input
                className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
                onChange={(event) => setSourceSessionDraft(event.target.value)}
                placeholder="Source session id"
                value={sourceSessionDraft}
              />
              <Button
                icon={<Search className="h-4 w-4" />}
                type="submit"
                variant="primary"
              >
                Apply filters
              </Button>
            </form>
            <CapsuleList
              capsules={capsules}
              isLoading={capsulesQuery.isLoading}
              onSelect={setSelectedCapsuleId}
              selectedCapsuleId={selectedCapsule?.capsule_id}
            />
          </div>
        </aside>
        <section className="min-w-0 bg-canvas">
          <CapsuleDetail
            capsule={selectedCapsule}
            onChanged={invalidateCapsules}
            userId={user.user_id}
          />
        </section>
      </div>
    </ConsoleLayout>
  );
}

function CapsuleList({
  capsules,
  isLoading,
  onSelect,
  selectedCapsuleId,
}: {
  capsules: KnowledgeCapsule[];
  isLoading: boolean;
  onSelect: (capsuleId: string) => void;
  selectedCapsuleId?: string;
}) {
  if (isLoading) {
    return <EmptyState label="Loading capsules" />;
  }

  return (
    <section className="grid gap-2">
      <div className="flex min-w-0 items-center justify-between">
        <TruncatedText className="text-sm font-medium">Capsules</TruncatedText>
        <Badge className="font-mono">{String(capsules.length)}</Badge>
      </div>
      <div className="grid overflow-hidden rounded-lg border border-hairline">
        {capsules.map((capsule) => (
          <button
            className={`grid min-w-0 gap-1 border-b border-hairline px-3 py-2.5 text-left transition last:border-b-0 ${
              capsule.capsule_id === selectedCapsuleId
                ? "bg-surface-2"
                : "bg-surface-1 hover:bg-surface-2"
            }`}
            key={capsule.capsule_id}
            onClick={() => onSelect(capsule.capsule_id)}
            type="button"
          >
            <div className="flex min-w-0 items-center justify-between gap-3">
              <TruncatedText className="text-sm font-medium">
                {capsule.title || capsule.keyword}
              </TruncatedText>
              <Badge tone={capsule.status === "active" ? "success" : "neutral"}>
                {capsule.status}
              </Badge>
            </div>
            <TruncatedText className="text-xs text-ink-muted">
              {capsule.summary}
            </TruncatedText>
            <MonoId tooltip={capsule.capsule_id}>
              {compactId(capsule.capsule_id)}
            </MonoId>
          </button>
        ))}
        {capsules.length === 0 && <EmptyState label="No capsules" />}
      </div>
    </section>
  );
}

function CapsuleDetail({
  capsule,
  onChanged,
  userId,
}: {
  capsule?: KnowledgeCapsule;
  onChanged: () => void;
  userId: string;
}) {
  const archive = useMutation({
    mutationFn: (capsuleId: string) =>
      archiveKnowledgeCapsule(userId, capsuleId),
    onSuccess: onChanged,
  });

  if (!capsule) {
    return (
      <div className="p-5">
        <EmptyState label="Select a capsule" />
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-5 p-5">
      <header className="flex min-w-0 items-start justify-between gap-4 border-b border-hairline pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-ink-tertiary">
            <Brain className="h-4 w-4" />
            capsule detail
          </div>
          <TruncatedText className="mt-2 text-2xl font-semibold">
            {capsule.title || capsule.keyword}
          </TruncatedText>
          <MonoId className="mt-1" tooltip={capsule.capsule_id}>
            {compactId(capsule.capsule_id)}
          </MonoId>
        </div>
        <Badge>{capsule.status}</Badge>
      </header>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="grid gap-3">
          <p className="text-sm leading-6 text-ink-muted">{capsule.summary}</p>
          <pre className="max-h-[60vh] overflow-auto rounded-lg border border-hairline bg-surface-1 p-4 text-sm leading-7 text-ink-muted">
            {capsule.content}
          </pre>
        </section>
        <aside className="grid content-start gap-3">
          <InfoRow label="Keyword" value={capsule.keyword} />
          <InfoRow label="Source session" value={capsule.source_session_id} />
          <InfoRow label="Source agent" value={capsule.source_agent_id} />
          <InfoRow label="Created by" value={capsule.created_by_user_id} />
          <InfoRow label="Truncated" value={capsule.truncated ? "yes" : "no"} />
          <JsonBlock label="References" value={capsule.references} />
          <Button
            disabled={archive.isPending || capsule.status !== "active"}
            icon={<Archive className="h-4 w-4" />}
            onClick={() => archive.mutate(capsule.capsule_id)}
            type="button"
            variant="danger"
          >
            Archive capsule
          </Button>
          {archive.error && <InlineError error={archive.error} />}
        </aside>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0 border-b border-hairline pb-3">
      <div className="text-xs text-ink-tertiary">{label}</div>
      <MonoId className="mt-1 text-ink-muted" tooltip={value ?? "unknown"}>
        {value?.startsWith("sess_") ||
        value?.startsWith("agent_") ||
        value?.startsWith("usr_")
          ? compactId(value)
          : (value ?? "unknown")}
      </MonoId>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-ink-tertiary">{label}</div>
      <pre className="mt-1 max-h-48 overflow-auto rounded-lg border border-hairline bg-surface-1 p-3 text-xs leading-6 text-ink-muted">
        {JSON.stringify(value ?? [], null, 2)}
      </pre>
    </div>
  );
}
