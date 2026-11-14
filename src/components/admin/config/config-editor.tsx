"use client";

import { useRef, useState } from "react";
import { useStore } from "zustand";
import {
  createConfigEditorStore,
  type ConfigAction as Action,
  type ConfigOutcome as Outcome,
} from "@/stores/config-editor-store";
import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/form-controls";
import { MonoId } from "@/components/ui/text";
import { useI18n } from "@/features/i18n/use-i18n";
import { AuthError } from "@/features/api/errors";
import type { Region } from "@/features/region/bootstrap";
import {
  configKeys,
  getConfig,
  setConfig,
  resetConfig,
  revertConfig,
  testConfig,
  configErrorDetails,
  type ConfigEntry,
  type ConfigSnapshot,
  type ConfigValue,
  type ConfigAuditItem,
  type FeatureStage,
} from "@/features/runtime-config";
import {
  displayValue,
  featureLabels,
  featureValue,
  stages,
} from "./config-display";

/** Non-persisted Zustand drafts belong to this drawer; secrets stay in the input. */
export function ConfigEditor({
  userId,
  region,
  entry,
  snapshot,
  initialStage,
  audit,
  onClose,
}: {
  userId: string;
  region: Region;
  entry: ConfigEntry;
  snapshot: ConfigSnapshot;
  initialStage?: FeatureStage;
  audit?: ConfigAuditItem;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const [editorStore] = useState(() =>
    createConfigEditorStore({
      value: entry.secret ? "" : String(entry.value ?? ""),
      stage:
        initialStage ??
        (entry.type === "feature" ? featureValue(entry).stage : "admin"),
      emails:
        entry.type === "feature"
          ? featureValue(entry).beta_emails.join("\n")
          : "",
      versions: { [region]: entry.version },
    }),
  );
  const {
    value,
    setValue,
    stage,
    setStage,
    emails,
    setEmails,
    versions,
    setVersions,
    reason,
    setReason,
    both,
    setBoth,
    confirm,
    setConfirm,
    outcomes,
    setOutcomes,
    reviewed,
    setReviewed,
    copied,
    setCopied,
    secretPresent,
    setSecretPresent,
  } = useStore(editorStore);
  const secretInput = useRef<HTMLInputElement>(null);
  const clearSecret = () => {
    if (secretInput.current) secretInput.current.value = "";
    setSecretPresent(false);
  };
  const version = versions[region] ?? entry.version;
  const other: Region = region === "us" ? "hk" : "us";
  const label = t(featureLabels[entry.key] ?? entry.label);
  const parsed = (): ConfigValue =>
    entry.type === "feature"
      ? {
          stage,
          beta_emails: emails
            .split(/[\n,;]/)
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean),
        }
      : entry.type === "bool"
        ? value === "true"
        : entry.type === "int"
          ? Number(value)
          : entry.secret
            ? (secretInput.current?.value ?? "")
            : value;
  const validValue =
    audit ||
    (entry.secret
      ? secretPresent
      : entry.type === "int"
        ? value.trim() !== "" && Number.isSafeInteger(Number(value))
        : true);
  const validReason = reason.trim().length > 0 && reason.length <= 500;

  async function refresh(target: Region) {
    // Cancel older snapshots before fetching the current item/version.
    await client.cancelQueries({
      queryKey: configKeys.snapshot(userId, target),
    });
    const fresh = await getConfig(target);
    client.setQueryData(configKeys.snapshot(userId, target), fresh);
    return fresh;
  }
  async function invalidate(target: Region) {
    await Promise.all([
      client.invalidateQueries({
        queryKey: configKeys.snapshot(userId, target),
      }),
      client.invalidateQueries({
        queryKey: ["runtime-config-audit", userId, target],
      }),
      client.invalidateQueries({ queryKey: ["features", userId] }),
    ]);
  }
  const mutation: UseMutationResult<Outcome[], Error, Action> = useMutation({
    // Only the action is cached. Secret payloads are read from a cleared mutable draft, never captured in mutation options or variables.
    mutationFn: async (action: Action) => {
      const submitted = parsed();
      const submittedReason = reason.trim();
      if (entry.secret) clearSecret();
      setReviewed(false);
      const results: Outcome[] = outcomes.filter(
        (result) => result.status === "saved",
      );
      const targets = outcomes.length
        ? outcomes
            .filter((result) => result.status !== "saved")
            .map((result) => result.region)
        : both && action !== "revert"
          ? [region, other]
          : [region];
      for (const target of targets) {
        let succeeded = false;
        try {
          const targetSnapshot =
            target === region ? snapshot : await refresh(target);
          const targetEntry = targetSnapshot.entries.find(
            (item) => item.key === entry.key,
          );
          if (!targetEntry) throw new Error("missing_key");
          if (
            entry.secret &&
            action === "save" &&
            !targetSnapshot.vault_configured
          )
            throw new Error("vault_not_configured");
          const request = {
            expected_version: versions[target] ?? targetEntry.version,
            reason: submittedReason,
          };
          const result =
            action === "reset"
              ? await resetConfig(target, entry.key, request)
              : action === "revert" && audit
                ? await revertConfig(target, audit.id, request)
                : await setConfig(target, entry.key, {
                    ...request,
                    value: submitted,
                  });
          succeeded = true;
          results.push({
            region: target,
            status: "saved",
            version: result.version,
          });
        } catch (error) {
          const details = configErrorDetails(error);
          const conflict = details.status === 409;
          results.push({
            region: target,
            status: conflict ? "conflict" : "failed",
            error:
              error instanceof AuthError
                ? "Access denied"
                : details.status === 412 ||
                    (error instanceof Error &&
                      error.message === "vault_not_configured")
                  ? "Vault not configured"
                  : details.status === 400
                    ? "Validation failed. Check the value and reason."
                    : "Could not save this region. Retry after reviewing its current value.",
          });
          if (conflict) {
            try {
              await refresh(target);
            } catch {
              /* Keep the draft blocked until an explicit successful review. */
            }
          }
        }
        setOutcomes([...results]);
        // A failed refresh must not turn a confirmed write into a failure.
        if (succeeded) await invalidate(target);
      }
      return results;
    },
    retry: false,
    gcTime: 0,
    onSettled: () => mutation.reset(),
  });
  const test = useMutation({
    mutationFn: async () => {
      const overrides = { [entry.key]: parsed() };
      if (entry.secret) clearSecret();
      try {
        return await testConfig(region, { group: entry.group, overrides });
      } catch {
        throw new Error("Connection failed");
      }
    },
    retry: false,
  });
  const copy = useMutation({
    mutationFn: async () => {
      const source = await getConfig("us");
      const original = source.entries.find((item) => item.key === entry.key);
      if (!original || original.secret || original.value == null)
        throw new Error("not_copyable");
      if (original.type === "feature") {
        const feature = featureValue(original);
        setStage(feature.stage);
        setEmails(feature.beta_emails.join("\n"));
      } else setValue(String(original.value));
      setCopied(true);
    },
    retry: false,
  });
  const review = useMutation({
    mutationFn: async () => {
      const next = { ...versions };
      for (const outcome of outcomes.filter(
        (result) => result.status !== "saved",
      )) {
        const fresh = await refresh(outcome.region);
        const current = fresh.entries.find((item) => item.key === entry.key);
        if (!current) throw new Error("missing_key");
        next[outcome.region] = current.version;
      }
      setVersions(next);
      setReviewed(true);
    },
    retry: false,
  });
  const busy =
    mutation.isPending || test.isPending || copy.isPending || review.isPending;
  const canWrite = !busy && validReason && reviewed;
  function submit(action: Action) {
    if (!canWrite || (action === "save" && !validValue)) return;
    if (
      action === "revert" ||
      (entry.type === "feature" &&
        (action === "reset" || stage === "off" || stage === "ga"))
    )
      setConfirm(action);
    else mutation.mutate(action);
  }

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !busy) onClose();
        }}
        size="drawer"
      >
        <div className="flex items-start justify-between gap-3">
          <DialogHeader
            title={
              audit
                ? t("Revert {name}", { name: label })
                : t("Edit {name}", { name: label })
            }
          />
          <Button
            aria-label={t("Close")}
            icon={<X className="h-4 w-4" />}
            size="icon"
            variant="ghost"
            disabled={busy}
            onClick={onClose}
          />
        </div>
        <MonoId>
          {entry.key} · {region.toUpperCase()} · v{version}
        </MonoId>
        <DialogBody className="grid content-start gap-5">
          {entry.description && (
            <p className="text-xs text-ink-subtle">{t(entry.description)}</p>
          )}
          {audit ? (
            <div className="grid gap-2">
              <p>
                {t("Restore the value before change #{id}.", { id: audit.id })}
              </p>
              <p className="break-all">
                {audit.new_display ?? t("Not set")} →{" "}
                {audit.old_display ?? t("Not set")}
              </p>
              <p className="text-xs text-warning">
                {t("Reverting creates a new change history entry.")}
              </p>
            </div>
          ) : (
            <>
              {entry.type === "feature" ? (
                <>
                  <label className="grid gap-2 text-sm">
                    {t("Feature stage")}
                    <Select
                      aria-label={t("Feature stage")}
                      value={stage}
                      disabled={busy}
                      onChange={(event) =>
                        setStage(event.target.value as FeatureStage)
                      }
                    >
                      {(Object.keys(stages) as FeatureStage[]).map((option) => (
                        <option value={option} key={option}>
                          {t(stages[option])}
                        </option>
                      ))}
                    </Select>
                  </label>
                  {stage === "beta" && (
                    <label className="grid gap-2 text-sm">
                      {t("Beta emails")}
                      <Textarea
                        aria-label={t("Beta emails")}
                        value={emails}
                        disabled={busy}
                        onChange={(event) => setEmails(event.target.value)}
                      />
                      <span className="text-xs text-ink-tertiary">
                        {t("One email per line. Administrators retain access.")}
                      </span>
                    </label>
                  )}
                </>
              ) : (
                <label className="grid gap-2 text-sm">
                  {t("Value")}
                  {entry.type === "enum" || entry.type === "bool" ? (
                    <Select
                      aria-label={t("Value")}
                      value={value}
                      disabled={busy}
                      onChange={(event) => setValue(event.target.value)}
                    >
                      {entry.type === "enum" &&
                        !(entry.options ?? []).includes(value) && (
                          <option value={value}>{value || t("Not set")}</option>
                        )}
                      {(entry.type === "bool"
                        ? ["true", "false"]
                        : (entry.options ?? [])
                      ).map((option) => (
                        <option key={option} value={option}>
                          {entry.type === "bool"
                            ? option === "true"
                              ? t("Enabled")
                              : t("Disabled")
                            : option}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      aria-label={t("Value")}
                      autoComplete="off"
                      type={
                        entry.secret
                          ? "password"
                          : entry.type === "int"
                            ? "number"
                            : entry.type === "url"
                              ? "url"
                              : "text"
                      }
                      ref={entry.secret ? secretInput : undefined}
                      value={entry.secret ? undefined : value}
                      defaultValue={entry.secret ? "" : undefined}
                      disabled={busy}
                      placeholder={
                        entry.secret
                          ? entry.has_value
                            ? t(
                                "Already set {display}; enter a new value to replace",
                                { display: entry.display ?? "" },
                              )
                            : t("Enter a new secret")
                          : undefined
                      }
                      onChange={(event) => {
                        if (entry.secret) {
                          setSecretPresent(Boolean(event.target.value.trim()));
                        } else setValue(event.target.value);
                      }}
                    />
                  )}
                  {entry.secret && (
                    <span className="text-xs text-ink-tertiary">
                      {t("Write only. Secret values cannot be read or copied.")}
                    </span>
                  )}
                </label>
              )}
              {region === "hk" && !entry.secret && (
                <div>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => copy.mutate()}
                  >
                    {t("Copy value from US")}
                  </Button>
                  {copied && (
                    <p role="status" className="mt-2 text-xs text-ink-subtle">
                      {t(
                        "US value copied into the draft. Save to apply it to HK.",
                      )}
                    </p>
                  )}
                  {copy.isError && (
                    <p role="alert" className="mt-2 text-xs text-danger">
                      {t("Could not copy the US value.")}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
          <label className="grid gap-2 text-sm">
            {t("Reason")} <span className="sr-only">{t("Required")}</span>
            <Textarea
              aria-label={t("Reason")}
              required
              maxLength={500}
              value={reason}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
            />
            <span className="text-xs text-ink-tertiary">
              {t("Required · up to 500 characters · saved in change history")}
            </span>
          </label>
          {!audit && (
            <label className="flex items-start gap-2 text-sm">
              <input
                className="mt-1 accent-primary"
                type="checkbox"
                checked={both}
                disabled={busy || outcomes.length > 0}
                aria-label={t("Also apply to {region}", {
                  region: other.toUpperCase(),
                })}
                onChange={(event) => setBoth(event.target.checked)}
              />
              <span>
                {t("Also apply to {region}", { region: other.toUpperCase() })}
                <span className="mt-1 block text-xs text-ink-tertiary">
                  {t(
                    "Each region is saved separately and reports its own result.",
                  )}
                </span>
              </span>
            </label>
          )}
          {entry.secret && !snapshot.vault_configured && (
            <p role="alert" className="text-xs text-warning">
              {t(
                "Vault not configured. Secret writes are unavailable in this region.",
              )}
            </p>
          )}
          {entry.pending_restart && (
            <Badge tone="warning">{t("Restart required")}</Badge>
          )}
          {outcomes.length > 0 && (
            <section
              aria-label={t("Regional results")}
              className="grid gap-3 border-t border-hairline pt-4"
            >
              {outcomes.map((outcome) => (
                <div key={outcome.region}>
                  <div className="flex justify-between gap-3 text-sm">
                    <strong>{outcome.region.toUpperCase()}</strong>
                    <span
                      className={
                        outcome.status === "saved"
                          ? "text-success"
                          : "text-danger"
                      }
                    >
                      {outcome.status === "saved"
                        ? t("Saved · v{version}", {
                            version: outcome.version ?? 0,
                          })
                        : outcome.status === "conflict"
                          ? t("Conflict · not saved")
                          : t("Failed · not saved")}
                    </span>
                  </div>
                  {outcome.status !== "saved" && (
                    <p role="alert" className="mt-2 text-xs text-warning">
                      {outcome.status === "conflict"
                        ? t(
                            "Changed by another administrator. The current value has been refreshed. Review before saving again.",
                          )
                        : t(outcome.error!)}
                    </p>
                  )}
                </div>
              ))}
              {outcomes.some((outcome) => outcome.status !== "saved") && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => review.mutate()}
                >
                  {t("Review current version")}
                </Button>
              )}
              {outcomes
                .filter((outcome) => outcome.status !== "saved")
                .map((outcome) => {
                  const current = client
                    .getQueryData<ConfigSnapshot>(
                      configKeys.snapshot(userId, outcome.region),
                    )
                    ?.entries.find((item) => item.key === entry.key);
                  return (
                    <p
                      key={outcome.region}
                      className="break-all text-xs text-ink-tertiary"
                    >
                      {outcome.region.toUpperCase()} ·{" "}
                      {t("Current value: {value}", {
                        value: current
                          ? current.secret
                            ? (current.display ?? t("Not set"))
                            : current.type === "feature"
                              ? `${t(stages[featureValue(current).stage])}${featureValue(current).beta_emails.length ? ` · ${featureValue(current).beta_emails.join(", ")}` : ""}`
                              : (displayValue(current) ?? t("Not set"))
                          : t("Unknown"),
                      })}
                    </p>
                  );
                })}
            </section>
          )}
          {review.isError && (
            <p role="alert" className="text-xs text-danger">
              {t(
                "Could not refresh configuration. Check the selected region and retry.",
              )}
            </p>
          )}
          {test.data && (
            <p
              role="status"
              className={`text-xs ${test.data.ok ? "text-success" : "text-danger"}`}
            >
              {test.data.ok
                ? t("Connection succeeded ({ms} ms)", {
                    ms: test.data.latency_ms,
                  })
                : t("Connection failed")}
            </p>
          )}
          {test.isError && (
            <p role="alert" className="text-xs text-danger">
              {t("Connection failed")}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          {!audit && entry.source === "db" && (
            <Button
              className="mr-auto"
              variant="ghost"
              disabled={!canWrite}
              onClick={() => submit("reset")}
            >
              {t("Reset override")}
            </Button>
          )}
          {!audit && entry.testable && (
            <Button
              variant="secondary"
              disabled={busy || !validValue}
              onClick={() => test.mutate()}
            >
              {test.isPending ? t("Testing...") : t("Test connection")}
            </Button>
          )}
          <Button
            variant="primary"
            disabled={
              !canWrite ||
              !validValue ||
              (!audit && entry.secret && !snapshot.vault_configured)
            }
            onClick={() => submit(audit ? "revert" : "save")}
          >
            {mutation.isPending
              ? t("Saving...")
              : audit
                ? t("Revert")
                : t("Save")}
          </Button>
        </DialogFooter>
      </Dialog>
      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => {
          if (!open) setConfirm(undefined);
        }}
        title={
          confirm === "revert"
            ? t("Confirm revert")
            : t("Confirm feature access change")
        }
        description={
          confirm === "revert"
            ? t(
                "Restore the previous value of {name} in {region}? This affects everyone using this configuration.",
                { name: label, region: region.toUpperCase() },
              )
            : confirm === "reset"
              ? t(
                  "Reset {name} in {region} to its environment or default value? This may change access for every user.",
                  {
                    name: label,
                    region: both
                      ? `${region.toUpperCase()} / ${other.toUpperCase()}`
                      : region.toUpperCase(),
                  },
                )
              : stage === "ga"
                ? t(
                    "All signed-in users in {region} will have access to {name}.",
                    {
                      name: label,
                      region: both
                        ? `${region.toUpperCase()} / ${other.toUpperCase()}`
                        : region.toUpperCase(),
                    },
                  )
                : t(
                    "No users in {region}, including administrators, will have access to {name}.",
                    {
                      name: label,
                      region: both
                        ? `${region.toUpperCase()} / ${other.toUpperCase()}`
                        : region.toUpperCase(),
                    },
                  )
        }
        confirmLabel={t("Confirm")}
        disabled={busy}
        onConfirm={() => {
          const action = confirm;
          setConfirm(undefined);
          if (action) mutation.mutate(action);
        }}
      />
    </>
  );
}
