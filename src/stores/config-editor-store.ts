import { createStore } from "zustand/vanilla";
import type { Region } from "@/features/region/bootstrap";
import type { FeatureStage } from "@/features/runtime-config";

export type ConfigAction = "save" | "reset" | "revert";
export type ConfigOutcome = {
  region: Region;
  status: "saved" | "conflict" | "failed";
  version?: number;
  error?: string;
};
type EditorDraft = {
  value: string;
  stage: FeatureStage;
  emails: string;
  versions: Partial<Record<Region, number>>;
  reason: string;
  both: boolean;
  confirm?: ConfigAction;
  outcomes: ConfigOutcome[];
  reviewed: boolean;
  copied: boolean;
  secretPresent: boolean;
};
type EditorActions = {
  setValue: (value: string) => void;
  setStage: (stage: FeatureStage) => void;
  setEmails: (emails: string) => void;
  setVersions: (versions: EditorDraft["versions"]) => void;
  setReason: (reason: string) => void;
  setBoth: (both: boolean) => void;
  setConfirm: (confirm?: ConfigAction) => void;
  setOutcomes: (outcomes: ConfigOutcome[]) => void;
  setReviewed: (reviewed: boolean) => void;
  setCopied: (copied: boolean) => void;
  setSecretPresent: (secretPresent: boolean) => void;
};

/** One non-persisted draft per drawer. No secret plaintext or server entries. */
export function createConfigEditorStore(
  initial: Pick<EditorDraft, "value" | "stage" | "emails" | "versions">,
) {
  return createStore<EditorDraft & EditorActions>((set) => ({
    ...initial,
    reason: "",
    both: false,
    outcomes: [],
    reviewed: true,
    copied: false,
    secretPresent: false,
    setValue: (value) => set({ value }),
    setStage: (stage) => set({ stage }),
    setEmails: (emails) => set({ emails }),
    setVersions: (versions) => set({ versions }),
    setReason: (reason) => set({ reason }),
    setBoth: (both) => set({ both }),
    setConfirm: (confirm) => set({ confirm }),
    setOutcomes: (outcomes) => set({ outcomes }),
    setReviewed: (reviewed) => set({ reviewed }),
    setCopied: (copied) => set({ copied }),
    setSecretPresent: (secretPresent) => set({ secretPresent }),
  }));
}

export type ConfigEditTarget = {
  key: string;
  stage?: FeatureStage;
  auditId?: number;
};
/** Page-only navigation state; audit records remain in TanStack Query. */
export function createConfigDashboardStore() {
  return createStore<{
    edit?: ConfigEditTarget;
    search: string;
    auditKey: string;
    setEdit: (edit?: ConfigEditTarget) => void;
    setSearch: (search: string) => void;
    setAuditKey: (auditKey: string) => void;
  }>((set) => ({
    search: "",
    auditKey: "",
    setEdit: (edit) => set({ edit }),
    setSearch: (search) => set({ search }),
    setAuditKey: (auditKey) => set({ auditKey }),
  }));
}
