import type {
  AgentPermissionCatalog,
  AgentPermissionChoice,
  SessionApprovalMode,
} from "@/features/api/types";

export const PAX_AUTO_APPROVE_CHOICE_ID = "pax:auto_approve";
export const PAX_MANUAL_CHOICE_ID = "pax:manual";

export const paxAutoApproveChoice: AgentPermissionChoice = {
  choice_id: PAX_AUTO_APPROVE_CHOICE_ID,
  description:
    "PAX answers permission requests automatically while the agent keeps its default permission configuration.",
  kind: "pax",
  label: "Auto approve (PAX)",
};

export const paxManualChoice: AgentPermissionChoice = {
  choice_id: PAX_MANUAL_CHOICE_ID,
  description: "PAX asks before responding to agent permission requests.",
  kind: "pax",
  label: "Ask before tools",
};

export function permissionChoicesFromCatalog(
  catalog?: AgentPermissionCatalog,
): AgentPermissionChoice[] {
  const catalogChoices = dedupeChoices(catalog?.choices ?? []);
  const nativeChoices = catalogChoices.filter(
    (choice) =>
      choice.kind === "agent" &&
      choice.choice_id !== PAX_AUTO_APPROVE_CHOICE_ID &&
      choice.choice_id !== PAX_MANUAL_CHOICE_ID,
  );
  const reportedPaxAuto = catalogChoices.find(
    (choice) => choice.choice_id === PAX_AUTO_APPROVE_CHOICE_ID,
  );

  if (nativeChoices.length === 0) {
    return [reportedPaxAuto ?? paxAutoApproveChoice, paxManualChoice];
  }

  return [reportedPaxAuto ?? paxAutoApproveChoice, ...nativeChoices];
}

export function approvalModeForPermissionChoice(
  choiceId: string,
): SessionApprovalMode {
  return choiceId === PAX_AUTO_APPROVE_CHOICE_ID
    ? "auto_approve_all"
    : "manual";
}

export function defaultPermissionChoiceId(
  choices: AgentPermissionChoice[],
  approvalMode: SessionApprovalMode,
  defaultChoiceId?: string,
) {
  if (approvalMode === "auto_approve_all") {
    return PAX_AUTO_APPROVE_CHOICE_ID;
  }

  const catalogDefault = defaultChoiceId
    ? choices.find(
        (choice) =>
          choice.kind === "agent" && choice.choice_id === defaultChoiceId,
      )
    : undefined;
  if (catalogDefault) {
    return catalogDefault.requires_confirmation
      ? PAX_MANUAL_CHOICE_ID
      : catalogDefault.choice_id;
  }

  const firstNativeChoice = choices.find((choice) => choice.kind === "agent");
  if (!firstNativeChoice || firstNativeChoice.requires_confirmation) {
    return PAX_MANUAL_CHOICE_ID;
  }
  return firstNativeChoice.choice_id;
}

export function resolvePermissionChoiceId(
  choices: AgentPermissionChoice[],
  approvalMode: SessionApprovalMode,
  selectedChoiceId?: string,
  defaultChoiceId?: string,
  preserveUnavailableSelection = false,
) {
  // Keep an explicit selection while a second catalog query is pending (for
  // example when Home hands a draft session to Workbench). Once a catalog is
  // available, do not keep a choice that belongs to a different agent/profile.
  if (
    selectedChoiceId &&
    (selectedChoiceId === PAX_MANUAL_CHOICE_ID ||
      preserveUnavailableSelection ||
      choices.some((choice) => choice.choice_id === selectedChoiceId))
  ) {
    return selectedChoiceId;
  }
  return defaultPermissionChoiceId(choices, approvalMode, defaultChoiceId);
}

export function shouldWaitForInitialPermissionCatalog(
  initialPermissionChoiceId: string | undefined,
  catalogPending: boolean,
) {
  return !initialPermissionChoiceId && catalogPending;
}

export function shouldRecoverPermissionCatalogAfterCreateFailure(
  permissionChoiceId: string | undefined,
  status: number | undefined,
) {
  return (
    Boolean(permissionChoiceId?.startsWith("agent:")) &&
    (status === 409 || status === 502)
  );
}

export function permissionChoiceById(
  choices: AgentPermissionChoice[],
  choiceId: string,
) {
  return choices.find((choice) => choice.choice_id === choiceId);
}

function dedupeChoices(choices: AgentPermissionChoice[]) {
  const seen = new Set<string>();
  return choices.filter((choice) => {
    if (!choice.choice_id || !choice.label || seen.has(choice.choice_id)) {
      return false;
    }
    seen.add(choice.choice_id);
    return true;
  });
}
