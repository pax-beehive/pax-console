"use client";

import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch, userPath } from "./client";
import { ApiError, AuthError } from "./errors";

export type WorkspaceSearchKind = "session" | "message" | "summary";
export type WorkspaceMessageView = "first" | "last" | "full";

export type WorkspaceSearchRef = {
  kind: WorkspaceSearchKind;
  id: string;
  revision?: number;
  content_hash?: string;
  canonicalization_version?: string;
};

export type WorkspaceSearchHit = {
  ref: WorkspaceSearchRef;
  title?: string;
  snippet: string;
  agent_id?: string;
  session_id?: string;
};

export type WorkspaceSearchPage = {
  hits: WorkspaceSearchHit[];
  next_cursor?: string;
};

export type WorkspaceSearchInput = {
  query: string;
  kinds?: WorkspaceSearchKind[];
  session_ids?: string[];
  cursor?: string;
  limit?: number;
};

export type WorkspaceReadRequest = {
  ref: WorkspaceSearchRef;
  view?: WorkspaceMessageView;
  offset?: number;
  limit?: number;
  before?: number;
  after?: number;
};

export type WorkspaceMessageRead = {
  ref: WorkspaceSearchRef;
  message_id: string;
  agent_id: string;
  session_id: string;
  role: string;
  session_seq: number;
  conversation_id?: string;
  created_at: string;
  text: string;
  view: WorkspaceMessageView;
  available_views: WorkspaceMessageView[];
  has_more: boolean;
  next_offset?: number;
  read_receipt: string;
  context?: WorkspaceMessageRead[];
};

export type WorkspaceMessageVersionRef = {
  message_id: string;
  content_hash: string;
  canonicalization_version: string;
  read_receipt?: string;
};

export type WorkspaceSummaryRef = {
  summary_id: string;
  revision: number;
};

export type WorkspaceSummaryEvidence = {
  message: WorkspaceMessageVersionRef;
  quote: string;
  view?: WorkspaceMessageView;
  read_receipt?: string;
};

export type WorkspaceSummaryClaim = {
  id: string;
  kind?: string;
  text: string;
  basis?: string;
  state?: string;
  supersedes?: string[];
  evidence?: WorkspaceSummaryEvidence[];
};

export type WorkspaceSummaryVersion = {
  summary_id: string;
  revision: number;
  owner_user_id: string;
  subject_type: "fragment" | "topic" | "direction" | "project";
  subject_id: string;
  title: string;
  body: string;
  claims?: WorkspaceSummaryClaim[];
  coverage: WorkspaceMessageVersionRef[];
  summary_sources?: WorkspaceSummaryRef[];
  created_at: string;
};

export type WorkspaceSessionRead = {
  kind: "session";
  source_id: string;
  owner_user_id?: string;
  agent_id?: string;
  session_id?: string;
  conversation_id?: string;
  title?: string;
  body?: string;
  role?: string;
  session_seq?: number;
  content_hash?: string;
  canonicalization_version?: string;
  revision: number;
  summary_revision?: number;
  created_at: string;
  deleted: boolean;
};

export type WorkspaceSourceRead =
  | WorkspaceMessageRead
  | WorkspaceSummaryVersion
  | WorkspaceSessionRead;

export function isWorkspaceMessageRead(
  source: WorkspaceSourceRead,
): source is WorkspaceMessageRead {
  return "message_id" in source;
}

export function isWorkspaceSummaryVersion(
  source: WorkspaceSourceRead,
): source is WorkspaceSummaryVersion {
  return "summary_id" in source;
}

// Deliberately select supported fields. Identity comes from Manager auth, never
// from an owner field supplied by a component or read reference.
function searchPayload(input: WorkspaceSearchInput): WorkspaceSearchInput {
  return {
    query: input.query,
    kinds: input.kinds,
    session_ids: input.session_ids,
    cursor: input.cursor,
    limit: input.limit,
  };
}

function readPayload(request: WorkspaceReadRequest): WorkspaceReadRequest {
  const { kind, id, revision, content_hash, canonicalization_version } =
    request.ref;
  return {
    ref: { kind, id, revision, content_hash, canonicalization_version },
    view: request.view,
    offset: request.offset,
    limit: request.limit,
    before: request.before,
    after: request.after,
  };
}

export function searchWorkspace(
  userId: string,
  input: WorkspaceSearchInput,
  signal?: AbortSignal,
): Promise<WorkspaceSearchPage> {
  return apiFetch(userPath(userId, "/search"), {
    method: "POST",
    body: JSON.stringify(searchPayload(input)),
    signal,
  });
}

export function readWorkspaceSource(
  userId: string,
  request: WorkspaceReadRequest,
  signal?: AbortSignal,
): Promise<WorkspaceSourceRead> {
  return apiFetch(userPath(userId, "/search/read"), {
    method: "POST",
    body: JSON.stringify(readPayload(request)),
    signal,
  });
}

type WorkspaceSearchFilters = Omit<WorkspaceSearchInput, "cursor">;

function normalizedSearch(
  input: WorkspaceSearchFilters,
): WorkspaceSearchFilters {
  return {
    query: input.query.trim(),
    kinds: input.kinds?.length ? [...new Set(input.kinds)].sort() : undefined,
    session_ids: input.session_ids?.length
      ? [...new Set(input.session_ids)].sort()
      : undefined,
    limit: input.limit,
  };
}

export const workspaceSearchKeys = {
  all: (userId: string) => ["workspace-search", userId] as const,
  search: (userId: string, input: WorkspaceSearchFilters) =>
    ["workspace-search", userId, "search", normalizedSearch(input)] as const,
  source: (userId: string, request?: WorkspaceReadRequest) =>
    [
      "workspace-search",
      userId,
      "source",
      request ? readPayload(request) : null,
    ] as const,
};

function retryWorkspaceRequest(failureCount: number, error: Error) {
  if (error instanceof AuthError || error.name === "AbortError") return false;
  if (
    error instanceof ApiError &&
    [400, 401, 403, 404, 409].includes(error.status)
  ) {
    return false;
  }
  return failureCount < 2;
}

export function useWorkspaceSearch(
  userId: string | undefined,
  input: WorkspaceSearchFilters,
) {
  const filters = normalizedSearch(input);
  const queryClient = useQueryClient();
  const queryKey = workspaceSearchKeys.search(userId ?? "pending", filters);
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      searchWorkspace(
        userId as string,
        { ...filters, cursor: pageParam },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next_cursor || undefined,
    enabled: Boolean(userId && filters.query),
    retry: retryWorkspaceRequest,
  });
  return {
    ...query,
    restart: () => queryClient.resetQueries({ queryKey, exact: true }),
  };
}

export function useWorkspaceSource(
  userId: string | undefined,
  request: WorkspaceReadRequest | undefined,
) {
  return useQuery({
    queryKey: workspaceSearchKeys.source(userId ?? "pending", request),
    queryFn: ({ signal }) =>
      readWorkspaceSource(
        userId as string,
        request as WorkspaceReadRequest,
        signal,
      ),
    enabled: Boolean(userId && request?.ref.id),
    retry: retryWorkspaceRequest,
  });
}
