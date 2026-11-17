"use client";

import { useI18n } from "@/features/i18n/use-i18n";
import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/features/api/errors";
import type {
  HostingAdminChange,
  HostingAdminFields,
  HostingAdminSnapshot,
} from "@/features/api/hosting-admin";

export type GatewayFormValues = Record<string, string | boolean>;
export const gatewayInputClass =
  "min-h-9 min-w-0 w-full rounded-md border border-hairline bg-surface-1 px-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:opacity-50";

export function GatewayField({
  label,
  value,
  onChange,
  disabled,
  numeric,
}: {
  label: string;
  value: string | boolean;
  onChange: (value: string) => void;
  disabled?: boolean;
  numeric?: boolean;
}) {
  const { t } = useI18n();
  return (
    <label className="grid min-w-0 gap-1 text-xs text-ink-muted">
      {t(label)}
      <input
        className={gatewayInputClass}
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
        inputMode={numeric ? "numeric" : "decimal"}
        disabled={disabled}
        maxLength={32}
        autoComplete="off"
      />
    </label>
  );
}

/** Keep both the draft and its original revision until explicitly saved/reset. */
export function GatewayForm({
  label,
  revision,
  values,
  buildChange,
  save,
  children,
}: {
  label: string;
  revision: number;
  values: GatewayFormValues;
  buildChange: (
    values: GatewayFormValues,
    baseline: GatewayFormValues,
  ) => HostingAdminFields;
  save: (change: HostingAdminChange) => Promise<HostingAdminSnapshot>;
  children: (
    draft: GatewayFormValues,
    change: (key: string, value: string | boolean) => void,
    pending: boolean,
  ) => ReactNode;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    revision,
    baseline: values,
    draft: values,
  });
  const [validationError, setValidationError] = useState("");
  const [conflict, setConflict] = useState(false);
  const dirty = JSON.stringify(form.baseline) !== JSON.stringify(form.draft);
  const sameRevisionChanged =
    revision === form.revision &&
    JSON.stringify(form.baseline) !== JSON.stringify(values);
  // Background refresh can replace pristine forms, never an operator's draft.
  if (!dirty && (revision > form.revision || sameRevisionChanged)) {
    setForm({ revision, baseline: values, draft: values });
  }
  const mutation = useMutation({ mutationFn: save, retry: false });

  function reset() {
    setForm({ revision, baseline: values, draft: values });
    setValidationError("");
    setConflict(false);
    mutation.reset();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mutation.isPending || !dirty || conflict || sameRevisionChanged) return;
    let change: HostingAdminChange;
    try {
      change = {
        ...buildChange(form.draft, form.baseline),
        revision: form.revision,
      } as HostingAdminChange;
      setValidationError("");
    } catch (error) {
      setValidationError(
        error instanceof Error ? error.message : "Check the entered values.",
      );
      return;
    }
    try {
      const saved = await mutation.mutateAsync(change);
      setForm({
        revision: saved.revision,
        baseline: form.draft,
        draft: form.draft,
      });
      setConflict(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) setConflict(true);
    }
  }

  return (
    <form
      aria-label={t(label)}
      onSubmit={submit}
      className="grid min-w-0 gap-3"
    >
      <fieldset disabled={mutation.isPending} className="grid min-w-0 gap-3">
        {children(
          form.draft,
          (key, value) => {
            setForm((current) => ({
              ...current,
              draft: { ...current.draft, [key]: value },
            }));
            setValidationError("");
            mutation.reset();
          },
          mutation.isPending,
        )}
      </fieldset>
      {validationError ? (
        <p role="alert" className="text-xs text-warning">
          {t(validationError)}
        </p>
      ) : null}
      {conflict ? (
        <p role="alert" className="text-xs text-warning">
          {t(
            "Settings changed on the server. Your edits are preserved. Reload this form to review current values before saving.",
          )}
        </p>
      ) : mutation.isError ? (
        <p role="alert" className="text-xs text-warning">
          {t("Could not save settings{status}. Your edits are preserved.", {
            status:
              mutation.error instanceof ApiError
                ? ` (HTTP ${mutation.error.status})`
                : "",
          })}
        </p>
      ) : mutation.isSuccess && !dirty ? (
        <p role="status" className="text-xs text-success">
          {t("Saved.")}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          size="sm"
          variant="primary"
          disabled={
            !dirty || mutation.isPending || conflict || sameRevisionChanged
          }
        >
          {mutation.isPending
            ? t("Saving…")
            : t("Save {label}", { label: t(label.toLowerCase()) })}
        </Button>
        {(dirty || conflict) && (
          <Button
            type="button"
            size="sm"
            disabled={mutation.isPending}
            onClick={reset}
          >
            {t(conflict ? "Reload this form" : "Reset changes")}
          </Button>
        )}
        {dirty && form.revision !== revision && !conflict ? (
          <span className="text-xs text-warning">
            {t(
              "Server settings changed; reload this form to use the latest values.",
            )}
          </span>
        ) : null}
        {dirty && sameRevisionChanged && !conflict ? (
          <span className="text-xs text-warning">
            {t(
              "Server values changed. Reset changes to review the current configuration before saving.",
            )}
          </span>
        ) : null}
      </div>
    </form>
  );
}
