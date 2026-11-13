"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { ApiError, AuthError } from "@/features/api/errors";
import {
  usePrepareSecretaryOperation,
  useSaveSecretaryGuidance,
  useSecretaryGuidance,
  useSecretaryOperation,
  useSubmitSecretaryOperation,
  secretaryInstructionError,
  type SecretaryGuidance,
  type SecretaryOperation,
  type SecretaryOperationKind,
  type SubmitSecretaryOperation,
} from "@/features/api/secretary-control";

const fieldClass =
  "w-full min-w-0 rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-primary-focus disabled:opacity-50";

const operationReasons: Record<string, string> = {
  outcome_unknown:
    "The previous execution may still be running. Check its task's existing result before choosing to replace it.",
  invalid_output:
    "Secretary's result could not be published. Review its task, refine the requirements, or finish this range yourself.",
  source_changed:
    "Messages changed after this range was prepared. Prepare a fresh range before summarizing again.",
  summary_changed:
    "A summary changed after this operation was prepared. Review the latest summary before making a new edit.",
  input_size_limit:
    "This range exceeds the input budget. Choose a smaller range or write its summary yourself.",
  execution_failed:
    "The Secretary execution failed. Review its task before retrying or finishing this range yourself.",
};

export function SecretaryGuidanceEditor({
  userId,
  sourceId,
  onDirtyChange,
}: {
  userId: string;
  sourceId?: string;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const scope = sourceId ? "session" : "user";
  const query = useSecretaryGuidance(userId, scope, sourceId);
  const checkingAccess = query.isFetching && !query.isFetchedAfterMount;
  const denied =
    query.error instanceof AuthError ||
    (query.error instanceof ApiError && query.error.status === 404);
  return (
    <section
      aria-label={
        sourceId
          ? "Session summary requirements"
          : "Default summary requirements"
      }
      className="min-w-0 space-y-2 border-t border-hairline pt-4"
    >
      <h2 className="text-sm font-medium text-ink">
        {sourceId
          ? "Session summary requirements"
          : "Default summary requirements"}
      </h2>
      <p className="text-xs leading-5 text-ink-tertiary">
        {sourceId
          ? "Only this session. Supplements your defaults; a request can add its own instructions."
          : "Applies to future summary tasks across your sessions. Session and one-time requirements can refine it."}{" "}
        Saving does not rerun history or change an execution already in
        progress. Leave blank to clear.
      </p>
      {query.isPending || checkingAccess ? (
        <p role="status" className="text-xs text-ink-tertiary">
          Loading requirements…
        </p>
      ) : query.data && !denied ? (
        <GuidanceForm
          key={`${userId}:${sourceId ?? "user"}`}
          userId={userId}
          sourceId={sourceId}
          saved={query.data}
          onDirtyChange={onDirtyChange}
        />
      ) : (
        <p role="alert" className="text-xs text-warning">
          {query.error instanceof AuthError
            ? "Sign in again to view requirements."
            : denied
              ? "These requirements are no longer available."
              : "Could not load requirements."}
        </p>
      )}
      {query.isError && !(query.error instanceof AuthError) && (
        <Button
          size="sm"
          onClick={() => {
            void query.refetch();
          }}
        >
          Reload requirements
        </Button>
      )}
    </section>
  );
}

function GuidanceForm({
  userId,
  sourceId,
  saved,
  onDirtyChange,
}: {
  userId: string;
  sourceId?: string;
  saved: SecretaryGuidance;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [instruction, setInstruction] = useState(saved.instruction);
  const [baseline, setBaseline] = useState(saved.revision);
  const save = useSaveSecretaryGuidance(
    userId,
    sourceId ? "session" : "user",
    sourceId,
  );
  const changed = saved.revision !== baseline;
  const invalid = secretaryInstructionError(instruction);
  const dirty = instruction !== saved.instruction || changed;
  useEffect(() => {
    onDirtyChange?.(dirty || save.isPending);
  }, [dirty, save.isPending, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  return (
    <form
      className="space-y-2 [&_button]:min-h-11 sm:[&_button]:min-h-8"
      onSubmit={(event) => {
        event.preventDefault();
        if (save.isPending || changed || invalid) return;
        save.mutate(
          { instruction, expected_revision: baseline },
          {
            onSuccess: (data) => {
              setBaseline(data.revision);
              setInstruction(data.instruction);
            },
          },
        );
      }}
    >
      <label className="block text-xs text-ink-muted">
        {sourceId
          ? "Requirements for this session"
          : "Requirements for all sessions"}
        <textarea
          className={`${fieldClass} mt-1 min-h-24 resize-y`}
          value={instruction}
          disabled={save.isPending}
          onChange={(event) => {
            setInstruction(event.target.value);
            save.reset();
          }}
        />
      </label>
      {invalid && (
        <p role="alert" className="text-xs text-warning">
          {invalid}
        </p>
      )}
      {changed && (
        <p role="alert" className="text-xs text-warning">
          Saved requirements changed. Your draft is preserved. Reload before
          saving again.
        </p>
      )}
      {save.isError && (
        <p role="alert" className="text-xs text-warning">
          {save.error instanceof ApiError && save.error.status === 409
            ? "Another window changed the requirements. Your draft has been kept."
            : "Could not confirm the save. Your draft has been kept; reload the saved version before trying again."}
        </p>
      )}
      {save.isSuccess && (
        <p role="status" className="text-xs text-success">
          Requirements saved for future tasks.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={save.isPending || changed || Boolean(invalid)}
        >
          {save.isPending ? "Saving…" : "Save requirements"}
        </Button>
        {(dirty || save.isError) && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setInstruction(saved.instruction);
              setBaseline(saved.revision);
              save.reset();
            }}
          >
            {changed || save.isError
              ? "Reload saved requirements"
              : "Discard draft"}
          </Button>
        )}
      </div>
    </form>
  );
}

export function SecretarySessionControl({
  userId,
  sourceId,
  summaryId,
  operationId,
}: {
  userId: string;
  sourceId: string;
  summaryId?: string;
  operationId?: string;
}) {
  const [mode, setMode] = useState<"new" | "current">();
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="min-h-11 sm:min-h-8"
        onClick={() => setMode("new")}
      >
        {summaryId ? "Edit or guide summary" : "Guide or write summary"}
      </Button>
      {operationId && (
        <Button
          size="sm"
          variant="ghost"
          className="min-h-11 sm:min-h-8"
          onClick={() => setMode("current")}
        >
          View current operation
        </Button>
      )}
      {mode && (
        <SessionControlDialog
          userId={userId}
          sourceId={sourceId}
          summaryId={summaryId}
          operationId={mode === "current" ? operationId : undefined}
          onClose={() => setMode(undefined)}
        />
      )}
    </>
  );
}

function SessionControlDialog({
  userId,
  sourceId,
  summaryId,
  operationId,
  onClose,
}: {
  userId: string;
  sourceId: string;
  summaryId?: string;
  operationId?: string;
  onClose: () => void;
}) {
  const prepare = usePrepareSecretaryOperation(userId);
  const existing = useSecretaryOperation(userId, operationId);
  const [scope, setScope] = useState<"pending" | "all" | "selected">("pending");
  const [messageIds, setMessageIds] = useState("");
  const selectedIds = [...new Set(messageIds.split(/[\s,]+/).filter(Boolean))];
  const invalidSelection =
    scope === "selected" &&
    (selectedIds.length === 0 || selectedIds.length > 4096);
  const [created, setOperation] = useState<SecretaryOperation>();
  const [operationBusy, setOperationBusy] = useState(false);
  const [guidanceDirty, setGuidanceDirty] = useState(false);
  const checkingAccess = existing.isFetching && !existing.isFetchedAfterMount;
  const operation = operationId
    ? !existing.isError && !checkingAccess
      ? existing.data
      : undefined
    : created;
  const start = (kind: SecretaryOperationKind) =>
    prepare.mutate(
      {
        source_id: sourceId,
        kind,
        scope: kind === "human_edit" ? "pending" : scope,
        ...(kind !== "human_edit" && scope === "selected"
          ? { message_ids: selectedIds }
          : {}),
        ...(kind === "human_edit" ? { summary_id: summaryId } : {}),
      },
      { onSuccess: setOperation },
    );
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !prepare.isPending && !operationBusy) onClose();
      }}
      size="lg"
    >
      <DialogHeader
        title="Control this session's summary"
        description="Guide Secretary, or finish a range yourself without a model request."
      />
      {operationId && !operation ? (
        <>
          <DialogBody>
            <p
              role={existing.isError ? "alert" : "status"}
              className="text-sm text-ink-muted"
            >
              {existing.isError
                ? existing.error instanceof AuthError
                  ? "Sign in again to view this operation."
                  : "This operation could not be loaded. Reopen it to check its current state."
                : "Loading current operation…"}
            </p>
          </DialogBody>
          <DialogFooter>
            <Button
              className="min-h-11 sm:min-h-8"
              variant="ghost"
              onClick={onClose}
            >
              Close
            </Button>
          </DialogFooter>
        </>
      ) : operation ? (
        <OperationForm
          key={operation.operation_id}
          userId={userId}
          prepared={operation}
          onBusyChange={setOperationBusy}
          onClose={onClose}
        />
      ) : (
        <>
          <DialogBody className="space-y-5 [&_button]:min-h-11 sm:[&_button]:min-h-8">
            <SecretaryGuidanceEditor
              userId={userId}
              sourceId={sourceId}
              onDirtyChange={setGuidanceDirty}
            />
            <section className="space-y-3 border-t border-hairline pt-4">
              <h2 className="text-sm font-medium text-ink">One-time action</h2>
              <label className="block text-xs text-ink-muted">
                Message range
                <select
                  className={`${fieldClass} mt-1 min-h-11`}
                  value={scope}
                  onChange={(event) =>
                    setScope(
                      event.target.value as "pending" | "all" | "selected",
                    )
                  }
                >
                  <option value="pending">Pending messages</option>
                  <option value="all">
                    All messages, including previously processed
                  </option>
                  <option value="selected">
                    Choose message IDs (advanced)
                  </option>
                </select>
              </label>
              {scope === "selected" && (
                <label className="block text-xs text-ink-muted">
                  Message IDs (advanced)
                  <textarea
                    aria-label="Message IDs (advanced)"
                    className={`${fieldClass} mt-1 min-h-24 resize-y font-mono`}
                    value={messageIds}
                    onChange={(event) => setMessageIds(event.target.value)}
                  />
                  <span className="mt-1 block text-ink-tertiary">
                    Paste message IDs from this session, separated by spaces,
                    newlines, or commas. Up to 4,096 unique complete messages.
                    Manager verifies each message belongs to this session and is
                    readable.
                  </span>
                  <span className="mt-1 block">
                    {selectedIds.length} unique message IDs
                  </span>
                </label>
              )}
              <p className="text-xs text-ink-tertiary">
                Next, review the exact messages and select a smaller range if
                needed. Changing requirements alone does not start work.
              </p>
              <div className="flex flex-wrap gap-2">
                {guidanceDirty && (
                  <p role="status" className="w-full text-xs text-warning">
                    Save or discard session requirements before preparing.
                  </p>
                )}
                <Button
                  disabled={
                    prepare.isPending || invalidSelection || guidanceDirty
                  }
                  onClick={() => start("guided_summary")}
                >
                  Guide Secretary
                </Button>
                <Button
                  disabled={
                    prepare.isPending || invalidSelection || guidanceDirty
                  }
                  onClick={() => start("human_summary")}
                >
                  Write summary yourself
                </Button>
                {summaryId && (
                  <Button
                    disabled={prepare.isPending || guidanceDirty}
                    onClick={() => start("human_edit")}
                  >
                    Edit this summary
                  </Button>
                )}
              </div>
              {prepare.isPending && (
                <p role="status" className="text-xs text-ink-tertiary">
                  Preparing the message range…
                </p>
              )}
              {prepare.isError && (
                <p role="alert" className="text-xs text-warning">
                  {prepare.error instanceof AuthError
                    ? "Sign in again to manage this session."
                    : prepare.error instanceof ApiError &&
                        prepare.error.status === 409
                      ? "This range cannot be prepared. It may be empty, too large, or have changed. Your existing summaries are unchanged."
                      : "Could not prepare the range. Try again; no model request has been sent."}
                </p>
              )}
            </section>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="ghost"
              className="min-h-11 sm:min-h-8"
              disabled={prepare.isPending}
              onClick={onClose}
            >
              Close
            </Button>
          </DialogFooter>
        </>
      )}
    </Dialog>
  );
}

function OperationForm({
  userId,
  prepared,
  onBusyChange,
  onClose,
}: {
  userId: string;
  prepared: SecretaryOperation;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
}) {
  const current = useSecretaryOperation(userId, prepared.operation_id);
  const operation = current.data ?? prepared;
  const submit = useSubmitSecretaryOperation(userId, prepared.operation_id);
  useEffect(() => {
    onBusyChange(submit.isPending);
  }, [submit.isPending, onBusyChange]);
  const [selected, setSelected] = useState(() =>
    prepared.targets.map((target) => target.message_id),
  );
  const [coverage, setCoverage] = useState(() =>
    prepared.targets.slice(0, 1).map((target) => target.message_id),
  );
  const [instruction, setInstruction] = useState("");
  const [title, setTitle] = useState(prepared.summary?.title ?? "");
  const [body, setBody] = useState(prepared.summary?.body ?? "");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [visibleCount, setVisibleCount] = useState(100);
  const request = useRef<{ payload: string; id: string } | undefined>(
    undefined,
  );
  const edit = prepared.kind === "human_edit";
  const guided = prepared.kind === "guided_summary";
  const mutable = operation.status === "draft";
  const unavailable =
    current.error instanceof AuthError ||
    (current.error instanceof ApiError && current.error.status === 404);
  const instructionError = secretaryInstructionError(instruction);
  const summaryError =
    !guided && (title.includes("\0") || body.includes("\0"))
      ? "Summary text cannot contain a null character."
      : !guided &&
          (new TextEncoder().encode(title).length > 4096 ||
            new TextEncoder().encode(body).length > 65536)
        ? "Summary title must fit within 4,096 UTF-8 bytes and content within 64 KiB."
        : undefined;
  const valid =
    !unavailable &&
    mutable &&
    !instructionError &&
    !summaryError &&
    (edit || selected.length > 0) &&
    (guided || (title.trim() && body.trim() && (edit || coverage.length > 0)));
  const toggle = (ids: string[], id: string, checked: boolean) =>
    checked ? [...ids, id] : ids.filter((item) => item !== id);
  function send() {
    const input: Omit<SubmitSecretaryOperation, "request_id"> = {
      expected_revision: prepared.revision,
      ...(edit
        ? {
            summary_id: prepared.summary?.summary_id,
            expected_summary_revision: prepared.summary?.revision,
          }
        : { message_ids: selected }),
      ...(guided
        ? { run_instruction: instruction }
        : {
            title,
            body,
            ...(!edit ? { coverage_message_ids: coverage } : {}),
          }),
      ...(confirmReplace ? { confirm_replace: true } : {}),
    };
    const payload = JSON.stringify(input);
    if (request.current?.payload !== payload)
      request.current = { payload, id: crypto.randomUUID() };
    submit.mutate({ ...input, request_id: request.current.id });
  }
  if (unavailable)
    return (
      <>
        <DialogBody>
          <p role="alert" className="text-sm text-warning">
            This operation is no longer available to you. Sign in again or
            reopen this session to check current access.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="ghost"
            className="min-h-11 sm:min-h-8"
            onClick={onClose}
          >
            Close
          </Button>
        </DialogFooter>
      </>
    );
  return (
    <>
      <DialogBody className="space-y-4 [&_button]:min-h-11 sm:[&_button]:min-h-8">
        <p role="status" className="text-sm text-ink">
          {operation.status === "completed"
            ? edit
              ? "Summary version saved. Message progress is unchanged."
              : guided
                ? operation.result_refs?.length
                  ? "Selected messages processed. Published summaries are available below."
                  : "Selected messages processed. No new summary was needed."
                : "Summary saved. Processing progress has been updated."
            : operation.status === "queued" || operation.status === "running"
              ? "Secretary is processing this fixed range. Your instructions remain attached across batches and retries."
              : operation.status === "needs_attention"
                ? "This operation needs attention. Review its task before retrying."
                : operation.status === "superseded"
                  ? "This operation was replaced. Its result cannot overwrite the newer work."
                  : edit
                    ? "Editing creates a new version without changing message progress."
                    : `${selected.length} of ${prepared.targets.length} messages selected for processing.`}
        </p>
        {operation.error && (
          <p role="alert" className="text-xs text-warning">
            {operationReasons[operation.error] ??
              "The operation could not finish. Review this session's task for its current failure reason."}
          </p>
        )}
        {current.isError && (
          <p role="alert" className="text-xs text-warning">
            {unavailable
              ? "This operation is no longer available to you."
              : "Could not refresh this operation. Your draft is preserved."}
          </p>
        )}
        {operation.result_refs?.map((ref) => (
          <Button key={`${ref.summary_id}:${ref.revision}`} asChild size="sm">
            <Link
              href={`/settings/secretary/summaries?summary_id=${encodeURIComponent(ref.summary_id)}&revision=${ref.revision}`}
            >
              View saved summary
            </Link>
          </Button>
        ))}
        {prepared.instructions && (
          <details className="text-xs text-ink-muted">
            <summary className="cursor-pointer">
              Requirements frozen for this operation
            </summary>
            <dl className="mt-2 space-y-2 whitespace-pre-wrap break-words">
              <div>
                <dt className="font-medium">User defaults</dt>
                <dd>
                  {prepared.instructions.user?.instruction ||
                    "No additional requirements"}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Session requirements</dt>
                <dd>
                  {prepared.instructions.session?.instruction ||
                    "No additional requirements"}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Operation requirements</dt>
                <dd>
                  {prepared.instructions.run ||
                    instruction ||
                    "No additional requirements"}
                </dd>
              </div>
            </dl>
          </details>
        )}
        {mutable && (
          <fieldset
            disabled={submit.isPending || unavailable}
            className="min-w-0 space-y-4"
          >
            {!edit && (
              <section className="space-y-2">
                <h2 className="text-sm font-medium text-ink">
                  Messages to mark processed
                </h2>
                <p className="text-xs text-ink-tertiary">
                  Selections cover complete messages. Other messages keep their
                  existing progress.{" "}
                  {guided
                    ? "Secretary decides which sources support the summary."
                    : "Choose a few representative sources separately; they must belong to the processed range."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setSelected(
                        prepared.targets.map((target) => target.message_id),
                      )
                    }
                  >
                    Select all messages
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSelected([]);
                      setCoverage([]);
                    }}
                  >
                    Clear selection
                  </Button>
                </div>
                <div className="max-h-64 overflow-auto divide-y divide-hairline rounded-md border border-hairline">
                  {prepared.targets
                    .slice(0, visibleCount)
                    .map((target, index) => (
                      <div key={target.message_id} className="min-w-0 p-3">
                        <label className="flex min-h-11 items-start gap-2 text-xs text-ink">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={selected.includes(target.message_id)}
                            aria-label={`Process message ${index + 1}`}
                            onChange={(event) => {
                              setSelected(
                                toggle(
                                  selected,
                                  target.message_id,
                                  event.target.checked,
                                ),
                              );
                              if (!event.target.checked)
                                setCoverage(
                                  coverage.filter(
                                    (id) => id !== target.message_id,
                                  ),
                                );
                            }}
                          />
                          <span className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                            <strong>{target.role}</strong> · {target.preview}
                          </span>
                        </label>
                        {!guided && (
                          <label className="flex min-h-11 items-center gap-2 text-xs text-ink-muted">
                            <input
                              type="checkbox"
                              disabled={
                                !selected.includes(target.message_id) ||
                                (!coverage.includes(target.message_id) &&
                                  coverage.length >= 512)
                              }
                              checked={coverage.includes(target.message_id)}
                              aria-label={`Cite message ${index + 1}`}
                              onChange={(event) =>
                                setCoverage(
                                  toggle(
                                    coverage,
                                    target.message_id,
                                    event.target.checked,
                                  ),
                                )
                              }
                            />
                            Use as representative source
                          </label>
                        )}
                      </div>
                    ))}
                  {prepared.targets.length > visibleCount && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="m-2 min-h-11"
                      onClick={() => setVisibleCount(visibleCount + 100)}
                    >
                      Show more messages
                    </Button>
                  )}
                </div>
              </section>
            )}
            {guided ? (
              <label className="block text-xs text-ink-muted">
                Requirements for this operation only
                <textarea
                  aria-label="Requirements for this operation only"
                  className={`${fieldClass} mt-1 min-h-32 resize-y`}
                  value={instruction}
                  onChange={(event) => setInstruction(event.target.value)}
                />
                <span className="mt-1 block text-ink-tertiary">
                  Session and user defaults are frozen in this operation. This
                  instruction supplements them and takes precedence when
                  preferences conflict.
                </span>
              </label>
            ) : (
              <>
                <label className="block text-xs text-ink-muted">
                  Summary title
                  <input
                    className={`${fieldClass} mt-1`}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </label>
                <label className="block text-xs text-ink-muted">
                  Summary content
                  <textarea
                    className={`${fieldClass} mt-1 min-h-40 resize-y`}
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                  />
                </label>
                {!edit && (
                  <p className="text-xs text-ink-tertiary">
                    Saving completes the selected range without calling a model.
                    Representative sources support the summary; you do not need
                    to repeat every operation.
                  </p>
                )}
              </>
            )}
            {instructionError && (
              <p role="alert" className="text-xs text-warning">
                {instructionError}
              </p>
            )}
            {summaryError && (
              <p role="alert" className="text-xs text-warning">
                {summaryError}
              </p>
            )}
            <label className="flex min-h-11 items-start gap-2 text-xs text-ink-muted">
              <input
                type="checkbox"
                className="mt-1"
                checked={confirmReplace}
                onChange={(event) => setConfirmReplace(event.target.checked)}
              />
              <span>
                Replace this session&apos;s existing active or unknown task, if
                any. A previous execution may still finish, but its result will
                not overwrite this operation.
              </span>
            </label>
          </fieldset>
        )}
        {submit.isError && (
          <p role="alert" className="text-xs text-warning">
            {submit.error instanceof ApiError && submit.error.status === 409
              ? guided
                ? "The source, summary, or task changed. Your text is preserved. Ensure Secretary is enabled and resume a paused source task before asking it to run. If replacing active or unknown work, explicitly confirm above; otherwise close and prepare a fresh range after saving your draft."
                : "The source, summary, or task changed. Your text is preserved. If replacing active or unknown work, explicitly confirm above; otherwise close and prepare a fresh range after saving your draft."
              : submit.error instanceof AuthError
                ? "Sign in again before submitting."
                : "The result is unconfirmed. Your draft and request ID are kept. Check status or retry the same request."}
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button
          variant="ghost"
          className="min-h-11 sm:min-h-8"
          disabled={submit.isPending}
          onClick={onClose}
        >
          Close
        </Button>
        <Button
          variant="ghost"
          className="min-h-11 sm:min-h-8"
          disabled={current.isFetching || submit.isPending}
          onClick={() => {
            void current.refetch();
          }}
        >
          Check status
        </Button>
        {mutable && (
          <Button
            className="min-h-11 sm:min-h-8"
            disabled={!valid || submit.isPending}
            onClick={send}
          >
            {submit.isPending
              ? "Submitting…"
              : guided
                ? "Summarize selected messages"
                : edit
                  ? "Save summary version"
                  : "Save and complete selected range"}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
