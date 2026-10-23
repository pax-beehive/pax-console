"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  CloudDownload,
  Copy,
  FileText,
  LoaderCircle,
  ShieldAlert,
} from "lucide-react";
import {
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { PublicationArtifactViewer } from "@/components/artifacts/publication-artifact-viewer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { useCopyFeedback } from "@/components/ui/use-copy-feedback";
import { queryKeys } from "@/features/api/query-keys";
import {
  useArtifactFetchCheck,
  useArtifactPublication,
  useCreateArtifactFetch,
} from "@/features/api/resources";
import type { ArtifactFetchDenial } from "@/features/api/types";
import {
  localFileDenialMessage,
  localFileFetchErrorMessage,
  localFilePublicationFailureMessage,
} from "@/features/local-files/local-file-fetch-messages";
import {
  type LocalFileFetchRecord,
  localFileFetchScope,
  useLocalFileFetchStore,
} from "@/features/local-files/local-file-fetch-store";
import {
  type LocalFileFetchRequest,
  LocalFileLinkContext,
  type LocalFileLinkContextValue,
} from "@/features/local-files/local-file-link-context";
import { formatBytes } from "@/lib/format";

type LocalFileFetchProviderProps = {
  children: ReactNode;
  disabledReason?: string;
  enabled: boolean;
  sessionId: string;
  userId: string;
};

/**
 * Session scope for LocalFileLink. Owns the single fetch dialog for the
 * session so every chat, tool, and diff link shares one flow.
 */
export function LocalFileFetchProvider({
  children,
  disabledReason,
  enabled,
  sessionId,
  userId,
}: LocalFileFetchProviderProps) {
  const scope = localFileFetchScope(userId, sessionId);
  const [pending, setPending] = useState<{
    id: number;
    request: LocalFileFetchRequest;
    scope: string;
  } | null>(null);

  const requestFetch = useCallback(
    (request: LocalFileFetchRequest) =>
      setPending((current) => ({
        id: (current?.id ?? 0) + 1,
        request,
        scope,
      })),
    [scope],
  );

  const value = useMemo<LocalFileLinkContextValue>(
    () => ({ disabledReason, enabled, requestFetch, sessionId, userId }),
    [disabledReason, enabled, requestFetch, sessionId, userId],
  );

  return (
    <LocalFileLinkContext.Provider value={value}>
      {children}
      {enabled && pending && pending.scope === scope && (
        <LocalFileFetchDialog
          key={pending.id}
          onClose={() => setPending(null)}
          request={pending.request}
          sessionId={sessionId}
          userId={userId}
        />
      )}
    </LocalFileLinkContext.Provider>
  );
}

type Phase =
  | { kind: "reuse"; record: LocalFileFetchRecord }
  | { kind: "check" }
  | { kind: "denied"; denial: ArtifactFetchDenial; path: string }
  | { kind: "error"; message: string }
  | { kind: "publication"; publicationId: string; path: string };

type DialogFlowProps = {
  onClose: () => void;
  request: LocalFileFetchRequest;
  sessionId: string;
  userId: string;
};

function LocalFileFetchDialog({
  onClose,
  request,
  sessionId,
  userId,
}: DialogFlowProps) {
  const scope = localFileFetchScope(userId, sessionId);
  const [phase, setPhase] = useState<Phase>(() => {
    const record =
      useLocalFileFetchStore.getState().fetched[scope]?.[request.path];
    return record ? { kind: "reuse", record } : { kind: "check" };
  });
  const [size, setSize] = useState<"sm" | "lg">("sm");
  const fetchAgain = () => setPhase({ kind: "check" });
  const shared = { onClose, request };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
      size={phase.kind === "publication" ? size : "sm"}
    >
      {renderPhase()}
    </Dialog>
  );

  function renderPhase() {
    switch (phase.kind) {
      case "reuse":
        return (
          <ReuseView
            {...shared}
            onFetchAgain={fetchAgain}
            onOpen={() =>
              setPhase({
                kind: "publication",
                path: request.path,
                publicationId: phase.record.publicationId,
              })
            }
            record={phase.record}
          />
        );
      case "check":
        return (
          <CheckView
            {...shared}
            onAccepted={(publicationId, path) =>
              setPhase({ kind: "publication", path, publicationId })
            }
            onDenied={(denial, path) =>
              setPhase({ denial, kind: "denied", path })
            }
            onError={(message) => setPhase({ kind: "error", message })}
            sessionId={sessionId}
            userId={userId}
          />
        );
      case "denied":
        return (
          <DeniedView {...shared} denial={phase.denial} path={phase.path} />
        );
      case "error":
        return (
          <MessageView
            {...shared}
            message={phase.message}
            onFetchAgain={fetchAgain}
            title="Couldn't fetch the file"
          />
        );
      case "publication":
        return (
          <PublicationView
            {...shared}
            onFetchAgain={fetchAgain}
            path={phase.path}
            onSizeChange={setSize}
            publicationId={phase.publicationId}
            sessionId={sessionId}
            userId={userId}
          />
        );
    }
  }
}

function FetchDialogFrame({
  bodyClassName,
  children,
  footer,
  icon,
  title,
}: {
  bodyClassName?: string;
  children: ReactNode;
  footer: ReactNode;
  icon: ReactNode;
  title: ReactNode;
}) {
  return (
    <>
      <DialogHeader icon={icon} title={title} />
      <DialogBody className={bodyClassName}>{children}</DialogBody>
      <DialogFooter>{footer}</DialogFooter>
    </>
  );
}

function CopyPathButton({ path }: { path: string }) {
  const { copied, copy } = useCopyFeedback();
  return (
    <Button
      className="sm:mr-auto"
      icon={
        copied ? (
          <Check aria-hidden className="h-4 w-4" />
        ) : (
          <Copy aria-hidden className="h-4 w-4" />
        )
      }
      onClick={() => void copy(path)}
      size="sm"
      type="button"
      variant="secondary"
    >
      {copied ? "Copied" : "Copy path"}
    </Button>
  );
}

function CloseButton({
  label = "Close",
  onClose,
}: {
  label?: string;
  onClose: () => void;
}) {
  return (
    <Button onClick={onClose} size="sm" type="button" variant="ghost">
      {label}
    </Button>
  );
}

/** The exact path that will be read is the safety confirmation; always show it in full. */
function PathBlock({ line, path }: { line?: number; path: string }) {
  return (
    <div className="grid gap-1">
      <code className="block break-all rounded-md border border-hairline bg-canvas px-2.5 py-2 font-mono text-xs leading-5 text-ink">
        {path}
      </code>
      {line !== undefined && (
        <span className="text-xs text-ink-tertiary">
          Referenced at line {line}
        </span>
      )}
    </div>
  );
}

function ReuseView({
  onClose,
  onFetchAgain,
  onOpen,
  record,
  request,
}: {
  onClose: () => void;
  onFetchAgain: () => void;
  onOpen: () => void;
  record: LocalFileFetchRecord;
  request: LocalFileFetchRequest;
}) {
  return (
    <FetchDialogFrame
      footer={
        <>
          <CopyPathButton path={request.path} />
          <CloseButton label="Cancel" onClose={onClose} />
          <Button onClick={onFetchAgain} size="sm" type="button">
            Fetch again
          </Button>
          <Button onClick={onOpen} size="sm" type="button" variant="primary">
            Open fetched copy (fetched {clockTime(record.fetchedAt)})
          </Button>
        </>
      }
      icon={<FileText className="h-4 w-4" />}
      title="Already fetched"
    >
      <div className="grid gap-3">
        <p>You already fetched this file in this session.</p>
        <PathBlock line={request.line} path={request.path} />
      </div>
    </FetchDialogFrame>
  );
}

function CheckView({
  onAccepted,
  onClose,
  onDenied,
  onError,
  request,
  sessionId,
  userId,
}: {
  onAccepted: (publicationId: string, path: string) => void;
  onClose: () => void;
  onDenied: (denial: ArtifactFetchDenial, path: string) => void;
  onError: (message: string) => void;
  request: LocalFileFetchRequest;
  sessionId: string;
  userId: string;
}) {
  const scope = localFileFetchScope(userId, sessionId);
  const recordFetch = useLocalFileFetchStore((state) => state.recordFetch);
  const check = useArtifactFetchCheck(userId, sessionId, request.path);
  const createFetch = useCreateArtifactFetch(userId, sessionId);

  if (check.isError) {
    return (
      <MessageView
        message={localFileFetchErrorMessage(check.error)}
        onClose={onClose}
        onFetchAgain={() => void check.refetch()}
        request={request}
        retryLabel="Check again"
        title="Couldn't check the file"
      />
    );
  }

  if (!check.data) {
    return (
      <FetchDialogFrame
        footer={
          <>
            <CopyPathButton path={request.path} />
            <CloseButton label="Cancel" onClose={onClose} />
          </>
        }
        icon={<CloudDownload className="h-4 w-4" />}
        title="Fetch file from the agent's machine"
      >
        <div className="grid gap-3">
          <p className="flex items-center gap-2">
            <LoaderCircle
              aria-hidden
              className="h-4 w-4 shrink-0 animate-spin"
            />
            Checking the file on the agent&apos;s machine…
          </p>
          <PathBlock line={request.line} path={request.path} />
        </div>
      </FetchDialogFrame>
    );
  }

  const result = check.data;
  const path = result.path || request.path;

  if (!result.allowed) {
    return (
      <DeniedView
        denial={
          result.denial ?? {
            code: "unknown",
            message: "This file cannot be fetched.",
            rule: "",
          }
        }
        onClose={onClose}
        path={path}
        request={request}
      />
    );
  }

  const confirm = () =>
    createFetch.mutate(path, {
      onError: (error) => onError(localFileFetchErrorMessage(error)),
      onSuccess: (fetchResult) => {
        if (!fetchResult.accepted) {
          onDenied(fetchResult.denial, path);
          return;
        }
        recordFetch(scope, request.path, {
          fetchedAt: new Date().toISOString(),
          publicationId: fetchResult.publication.publication_id,
        });
        onAccepted(fetchResult.publication.publication_id, path);
      },
    });

  return (
    <FetchDialogFrame
      footer={
        <>
          <CopyPathButton path={path} />
          <CloseButton label="Cancel" onClose={onClose} />
          <Button
            disabled={createFetch.isPending}
            icon={
              createFetch.isPending ? (
                <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
              ) : undefined
            }
            onClick={confirm}
            size="sm"
            type="button"
            variant="primary"
          >
            Fetch and open
          </Button>
        </>
      }
      icon={<CloudDownload className="h-4 w-4" />}
      title="Fetch file from the agent's machine"
    >
      <div className="grid gap-3">
        <p>
          This file is on the agent&apos;s machine. Fetch it to view it here.
        </p>
        <PathBlock line={request.line} path={path} />
        {result.size_bytes !== undefined && (
          <dl className="flex gap-2 text-xs">
            <dt className="text-ink-tertiary">Size</dt>
            <dd className="font-mono text-ink-muted">
              {formatBytes(result.size_bytes)}
            </dd>
          </dl>
        )}
        <p className="text-xs leading-5 text-ink-tertiary">
          The file will be uploaded to PAX cloud storage and appear in this
          session&apos;s Artifacts panel.
        </p>
      </div>
    </FetchDialogFrame>
  );
}

function DeniedView({
  denial,
  onClose,
  path,
}: {
  denial: ArtifactFetchDenial;
  onClose: () => void;
  path: string;
  request: LocalFileFetchRequest;
}) {
  return (
    <FetchDialogFrame
      footer={
        <>
          <CopyPathButton path={path} />
          <CloseButton onClose={onClose} />
        </>
      }
      icon={<ShieldAlert className="h-4 w-4 text-warning" />}
      title="This file can't be fetched"
    >
      <div className="grid gap-3">
        <p className="text-ink">{localFileDenialMessage(denial, path)}</p>
        <PathBlock path={path} />
        {denial.rule && (
          <p className="flex items-center gap-1.5 text-xs text-ink-tertiary">
            <span>Rule</span>
            <code className="font-mono">{denial.rule}</code>
          </p>
        )}
      </div>
    </FetchDialogFrame>
  );
}

function MessageView({
  message,
  onClose,
  onFetchAgain,
  request,
  retryLabel = "Fetch again",
  title,
}: {
  message: string;
  onClose: () => void;
  onFetchAgain?: () => void;
  request: LocalFileFetchRequest;
  retryLabel?: string;
  title: string;
}) {
  return (
    <FetchDialogFrame
      footer={
        <>
          <CopyPathButton path={request.path} />
          {onFetchAgain && (
            <Button onClick={onFetchAgain} size="sm" type="button">
              {retryLabel}
            </Button>
          )}
          <CloseButton onClose={onClose} />
        </>
      }
      icon={<AlertCircle className="h-4 w-4 text-warning" />}
      title={title}
    >
      <div className="grid gap-3">
        <p className="text-ink">{message}</p>
        <PathBlock path={request.path} />
      </div>
    </FetchDialogFrame>
  );
}

function PublicationView({
  onClose,
  onFetchAgain,
  onSizeChange,
  path,
  publicationId,
  request,
  sessionId,
  userId,
}: {
  onClose: () => void;
  onFetchAgain: () => void;
  onSizeChange: (size: "sm" | "lg") => void;
  path: string;
  publicationId: string;
  request: LocalFileFetchRequest;
  sessionId: string;
  userId: string;
}) {
  const queryClient = useQueryClient();
  const forgetFetch = useLocalFileFetchStore((state) => state.forgetFetch);
  const publicationQuery = useArtifactPublication(userId, publicationId);
  const publication = publicationQuery.data?.publication;
  const status = publication?.status;

  // Grow the dialog before paint once the viewer can render.
  useLayoutEffect(() => {
    onSizeChange(status === "available" ? "lg" : "sm");
  }, [onSizeChange, status]);

  useEffect(() => {
    if (status === "failed") {
      forgetFetch(localFileFetchScope(userId, sessionId), request.path);
    }
    if (status === "available") {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.sessionArtifacts(userId, sessionId),
      });
    }
  }, [forgetFetch, queryClient, request.path, sessionId, status, userId]);

  if (status === "available") {
    return (
      <FetchDialogFrame
        footer={
          <>
            <CopyPathButton path={path} />
            <CloseButton onClose={onClose} />
          </>
        }
        icon={<FileText className="h-4 w-4" />}
        bodyClassName="flex flex-col"
        title={publication?.filename || request.label || basename(path)}
      >
        <PublicationArtifactViewer
          allowFullscreen={false}
          autoLoad
          className="min-h-0 flex-1 max-h-none"
          fallbackTitle={basename(path)}
          publicationId={publicationId}
          userId={userId}
        />
      </FetchDialogFrame>
    );
  }

  if (status === "failed") {
    return (
      <MessageView
        message={localFilePublicationFailureMessage(
          publication?.error_code,
          publication?.error_message,
        )}
        onClose={onClose}
        onFetchAgain={
          publication?.error_code === "secret_detected"
            ? undefined
            : onFetchAgain
        }
        request={request}
        title="Upload blocked"
      />
    );
  }

  if (publicationQuery.isError && !publication) {
    return (
      <MessageView
        message={localFileFetchErrorMessage(publicationQuery.error)}
        onClose={onClose}
        onFetchAgain={onFetchAgain}
        request={request}
        title="Couldn't fetch the file"
      />
    );
  }

  return (
    <FetchDialogFrame
      footer={
        <>
          <CopyPathButton path={path} />
          <CloseButton onClose={onClose} />
        </>
      }
      icon={<CloudDownload className="h-4 w-4" />}
      title="Fetching file"
    >
      <div className="grid gap-3">
        <p className="flex items-center gap-2 text-ink" role="status">
          <LoaderCircle aria-hidden className="h-4 w-4 shrink-0 animate-spin" />
          <span>{status === "uploading" ? "Uploading…" : "Preparing…"}</span>
        </p>
        <PathBlock path={path} />
        <p className="text-xs leading-5 text-ink-tertiary">
          You can close this dialog. The file will appear in the session&apos;s
          Artifacts panel when the upload finishes.
        </p>
      </div>
    </FetchDialogFrame>
  );
}

function clockTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
  });
}

function basename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}
