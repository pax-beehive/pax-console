"use client";

import { type Translator, useI18n } from "@/features/i18n/use-i18n";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import type {
  AgentPermissionCatalog,
  AgentPermissionChoice,
} from "@/features/api/types";
import { Button } from "@/components/ui/button";
import {
  SettingsRow,
  SettingsChoice,
  SettingsChoices,
} from "@/components/ui/settings-controls";
import { SessionSettings, useSessionSettings } from "./session-settings";
import {
  PAX_AUTO_APPROVE_CHOICE_ID,
  PAX_MANUAL_CHOICE_ID,
  defaultPermissionChoiceId,
  paxAutoApproveChoice,
  paxManualChoice,
  permissionChoiceById,
} from "@/features/permissions/permission-catalog";

export function permissionChoiceLabel(
  choice: AgentPermissionChoice,
  t: Translator,
) {
  if (
    choice.choice_id === PAX_MANUAL_CHOICE_ID &&
    choice.label === paxManualChoice.label
  )
    return t("Ask before tools");
  if (
    choice.choice_id === PAX_AUTO_APPROVE_CHOICE_ID &&
    choice.label === paxAutoApproveChoice.label
  )
    return t("Auto approve (PAX)");
  return choice.label;
}

function permissionChoiceDescription(
  choice: AgentPermissionChoice,
  t: Translator,
) {
  if (
    choice.choice_id === PAX_MANUAL_CHOICE_ID &&
    choice.description === paxManualChoice.description
  )
    return t("PAX asks before responding to agent permission requests.");
  if (
    choice.choice_id === PAX_AUTO_APPROVE_CHOICE_ID &&
    choice.description === paxAutoApproveChoice.description
  )
    return t(
      "PAX answers permission requests automatically while the agent keeps its default permission configuration.",
    );
  return choice.description;
}

type SessionPermissionSelectorProps = {
  field?: boolean;
  catalog?: AgentPermissionCatalog;
  choices: AgentPermissionChoice[];
  disabled?: boolean;
  error?: boolean;
  loading?: boolean;
  onChange: (choiceId: string) => void;
  value: string;
};

export function SessionPermissionSelector(
  props: SessionPermissionSelectorProps,
) {
  const { t } = useI18n();
  const settings = useSessionSettings();
  if (!settings) {
    const choice = permissionChoiceById(props.choices, props.value);
    const label = choice
      ? permissionChoiceLabel(choice, t)
      : props.value === PAX_MANUAL_CHOICE_ID
        ? t("Ask before tools")
        : props.value;
    return (
      <SessionSettings
        initialPage={{ id: "permissions", title: t("Permissions") }}
        trigger={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={props.disabled}
            aria-label={t("Session permissions: {label}", { label })}
            icon={<ShieldCheck className="h-4 w-4" />}
          >
            {label}
          </Button>
        }
      >
        <SessionPermissionSelector {...props} />
      </SessionSettings>
    );
  }
  return <SessionPermissionFields {...props} />;
}

function SessionPermissionFields({
  catalog,
  choices,
  disabled,
  error,
  loading,
  onChange,
  value,
}: SessionPermissionSelectorProps) {
  const { t } = useI18n();
  const settings = useSessionSettings()!;
  const [pendingConfirmation, setPendingConfirmation] =
    useState<AgentPermissionChoice | null>(null);
  const shouldExposeManualFallback =
    value === PAX_MANUAL_CHOICE_ID ||
    defaultPermissionChoiceId(choices, "manual", catalog?.default_choice_id) ===
      PAX_MANUAL_CHOICE_ID;
  const menuChoices =
    shouldExposeManualFallback &&
    !choices.some((choice) => choice.choice_id === PAX_MANUAL_CHOICE_ID)
      ? [
          ...choices.filter(
            (choice) => choice.choice_id === PAX_AUTO_APPROVE_CHOICE_ID,
          ),
          paxManualChoice,
          ...choices.filter(
            (choice) => choice.choice_id !== PAX_AUTO_APPROVE_CHOICE_ID,
          ),
        ]
      : choices;
  const paxChoices = menuChoices.filter((choice) => choice.kind === "pax");
  const agentChoices = menuChoices.filter((choice) => choice.kind === "agent");
  const selected = permissionChoiceById(choices, value) ?? {
    choice_id: value,
    kind: value.startsWith("pax:") ? ("pax" as const) : ("agent" as const),
    label: value === PAX_MANUAL_CHOICE_ID ? t("Ask before tools") : value,
  };

  function select(choice: AgentPermissionChoice) {
    if (disabled) return;
    if (choice.choice_id === value) {
      // Commit the manual fallback even when it masks a stale native selection.
      if (choice.choice_id === PAX_MANUAL_CHOICE_ID) onChange(choice.choice_id);
      settings.finish();
    } else if (choice.requires_confirmation) {
      setPendingConfirmation(choice);
      settings.navigate({
        id: "permission-confirm",
        title: t("Use {label}?", { label: choice.label }),
      });
    } else {
      onChange(choice.choice_id);
      settings.finish();
    }
  }
  if (settings.page.id === "home")
    return (
      <div className="mt-2 border-t border-hairline pt-2">
        <SettingsRow
          label={t("Permissions")}
          value={permissionChoiceLabel(selected, t)}
          ariaLabel={t("Session permissions: {label}", {
            label: permissionChoiceLabel(selected, t),
          })}
          disabled={disabled}
          onClick={() =>
            settings.navigate({ id: "permissions", title: t("Permissions") })
          }
        />
      </div>
    );
  if (settings.page.id === "permission-confirm" && pendingConfirmation) {
    // Recheck against the latest catalog so stale or removed choices cannot be committed.
    const choice = menuChoices.find(
      (choice) => choice.choice_id === pendingConfirmation.choice_id,
    );
    return (
      <div className="px-3 py-3">
        <p className="text-sm leading-6 text-ink-muted">
          {choice?.description ??
            pendingConfirmation.description ??
            t(
              "This agent permission can grant broad access to your machine and data.",
            )}
        </p>
        {!choice && (
          <p role="status" className="mt-3 text-sm text-ink-muted">
            {t("This permission is no longer available.")}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={settings.back}>
            {t("Cancel")}
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={disabled || !choice}
            onClick={() => {
              if (disabled || !choice) return;
              onChange(choice.choice_id);
              setPendingConfirmation(null);
              settings.finish();
            }}
          >
            {t("Use this permission")}
          </Button>
        </div>
      </div>
    );
  }
  if (settings.page.id !== "permissions") return null;
  return (
    <>
      <SettingsChoices label={t("Permissions")}>
        {paxChoices.map((choice) => (
          <SettingsChoice
            key={choice.choice_id}
            label={permissionChoiceLabel(choice, t)}
            description={permissionChoiceDescription(choice, t)}
            selected={choice.choice_id === value}
            disabled={disabled}
            onClick={() => select(choice)}
          />
        ))}
        {agentChoices.length > 0 && (
          <>
            <div className="mx-3 mb-1 mt-3 border-t border-hairline pt-4 text-xs text-ink-tertiary">
              {t("Agent permissions")}
            </div>
            {agentChoices.map((choice) => (
              <SettingsChoice
                key={choice.choice_id}
                label={choice.label}
                description={choice.description}
                selected={choice.choice_id === value}
                disabled={disabled}
                onClick={() => select(choice)}
              />
            ))}
          </>
        )}
      </SettingsChoices>
      {(loading || error || catalog?.stale) && (
        <p role="status" className="px-3 pt-4 text-xs leading-5 text-ink-muted">
          {loading
            ? t("Loading agent permissions…")
            : error
              ? t(
                  "Agent permissions are unavailable. Using PAX fallback controls.",
                )
              : t(
                  "Using cached {source} permissions while live options are unavailable.",
                  { source: catalog?.source ?? "agent" },
                )}
        </p>
      )}
    </>
  );
}
