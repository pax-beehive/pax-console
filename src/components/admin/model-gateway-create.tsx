"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/features/i18n/use-i18n";
import {
  dollarsToMicrousd,
  microusdToDollars,
  type HostingModelPolicy,
  parseTokenLimit,
  type HostingAdminChange,
  type HostingAdminSnapshot,
  type HostingModelCreate,
  type HostingProvider,
} from "@/features/api/hosting-admin";
import { OpenRouterCatalog } from "./model-gateway-catalog";
import {
  GatewayField,
  GatewayForm,
  gatewayInputClass,
  type GatewayFormValues,
} from "./model-gateway-form";

function createFields(
  draft: GatewayFormValues,
  existingModels: HostingModelPolicy[],
): HostingModelCreate {
  const targetId = String(draft.target_id).trim();
  const upstreamModel = String(draft.upstream_model).trim();
  const provider = String(draft.provider) as HostingProvider;
  if (!["openrouter", "openai", "anthropic"].includes(provider)) {
    throw new Error("Choose a supported provider.");
  }
  const identity = /^[A-Za-z0-9~][A-Za-z0-9._:/@+~=-]*$/;
  if (
    !identity.test(targetId) ||
    targetId.length > 128 ||
    targetId.includes("://")
  ) {
    throw new Error(
      "Enter a model alias of up to 128 letters, numbers or model ID punctuation.",
    );
  }
  if (
    !identity.test(upstreamModel) ||
    upstreamModel.length + provider.length + 1 > 256 ||
    upstreamModel.includes("://") ||
    upstreamModel
      .split("/")
      .some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(
      "Enter an upstream model ID of up to 256 letters, numbers or model ID punctuation.",
    );
  }
  if (
    existingModels.some(
      (model) =>
        model.provider === provider && model.upstream_model === upstreamModel,
    )
  ) {
    throw new Error("This provider and model are already configured.");
  }
  const maxOutput = parseTokenLimit(String(draft.max_output_tokens), 1);
  if (maxOutput > 8192)
    throw new Error("Max output tokens cannot exceed 8192.");
  const input = dollarsToMicrousd(String(draft.input));
  const output = dollarsToMicrousd(String(draft.output));
  if (input > 1_000_000_000_000 || output > 1_000_000_000_000) {
    throw new Error(
      "A model rate cannot exceed 1000000 USD per million tokens.",
    );
  }
  return {
    action: "model_create",
    target_id: targetId,
    provider,
    upstream_model: upstreamModel,
    moderation: draft.moderation === "off" ? "off" : "openai",
    max_output_tokens: maxOutput,
    input_microusd_per_million: input,
    output_microusd_per_million: output,
    enabled: false,
  };
}

export function AddModel({
  revision,
  save,
  userId,
  onDenied,
  existingModels,
}: {
  revision: number;
  userId: string;
  onDenied: () => void;
  existingModels: HostingModelPolicy[];
  save: (change: HostingAdminChange) => Promise<HostingAdminSnapshot>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <div className="mb-4 min-w-0">
      {saved ? (
        <p role="status" className="mb-3 text-xs text-success">
          {t(
            "Model saved and disabled. Connect its provider before enabling it.",
          )}
        </p>
      ) : null}
      {open ? (
        <div className="min-w-0 border-y border-hairline py-4">
          <h3 className="mb-2 text-sm font-medium text-ink">
            {t("Add model")}
          </h3>
          <p className="mb-3 text-xs leading-5 text-ink-tertiary">
            {t(
              "New models start disabled. Connect the provider before enabling them.",
            )}
          </p>
          <GatewayForm
            label={t("New model")}
            submitLabel={t("Create model")}
            preserveDraftOnReload
            revision={revision}
            values={{
              target_id: "",
              provider: "openrouter",
              upstream_model: "",
              moderation: "openai",
              max_output_tokens: "2048",
              input: "",
              output: "",
            }}
            buildChange={(draft) => createFields(draft, existingModels)}
            save={save}
            onSaved={() => {
              setOpen(false);
              setSaved(true);
            }}
          >
            {(draft, change, pending) => (
              <>
                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  <GatewayField
                    label={t("Model alias")}
                    inputMode="text"
                    maxLength={128}
                    value={draft.target_id}
                    onChange={(value) => change("target_id", value)}
                  />
                  <label className="grid min-w-0 gap-1 text-xs text-ink-muted">
                    {t("Provider")}
                    <select
                      className={gatewayInputClass}
                      value={String(draft.provider)}
                      onChange={(event) => {
                        change("provider", event.target.value);
                        change("upstream_model", "");
                        change("input", "");
                        change("output", "");
                        change("max_output_tokens", "2048");
                      }}
                    >
                      <option value="openrouter">OpenRouter</option>
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic</option>
                    </select>
                  </label>
                  {draft.provider === "openrouter" ? (
                    <OpenRouterCatalog
                      userId={userId}
                      selectedId={String(draft.upstream_model)}
                      existingModels={existingModels}
                      onDenied={onDenied}
                      onSelect={(item) => {
                        change("upstream_model", item.id);
                        change(
                          "input",
                          microusdToDollars(item.input_microusd_per_million),
                        );
                        change(
                          "output",
                          microusdToDollars(item.output_microusd_per_million),
                        );
                        change(
                          "max_output_tokens",
                          String(item.max_output_tokens),
                        );
                      }}
                    />
                  ) : null}
                  <GatewayField
                    label={t("Upstream model ID")}
                    disabled={draft.provider === "openrouter"}
                    inputMode="text"
                    maxLength={256}
                    value={draft.upstream_model}
                    onChange={(value) => change("upstream_model", value)}
                  />
                  <label className="grid min-w-0 gap-1 text-xs text-ink-muted">
                    {t("Safety policy for the new model")}
                    <select
                      className={gatewayInputClass}
                      value={String(draft.moderation)}
                      onChange={(event) =>
                        change("moderation", event.target.value)
                      }
                    >
                      <option value="openai">
                        {t("OpenAI moderation required")}
                      </option>
                      <option value="off">
                        {t("Off — skip moderation for this model")}
                      </option>
                    </select>
                  </label>
                </div>
                {draft.moderation === "off" ? (
                  <p className="text-xs text-warning">
                    {t("Requests to this model skip the OpenAI safety check.")}
                  </p>
                ) : null}
                <div className="grid min-w-0 gap-3 sm:grid-cols-3">
                  <GatewayField
                    numeric
                    label={t("Max output tokens for the new model")}
                    value={draft.max_output_tokens}
                    onChange={(value) => change("max_output_tokens", value)}
                  />
                  <GatewayField
                    label={t("Input USD / million for the new model")}
                    value={draft.input}
                    onChange={(value) => change("input", value)}
                  />
                  <GatewayField
                    label={t("Output USD / million for the new model")}
                    value={draft.output}
                    onChange={(value) => change("output", value)}
                  />
                </div>
                <p className="text-xs leading-5 text-ink-tertiary">
                  {t(
                    "Use a public alias for agents and the provider's exact model ID. Prices are required; enter zero explicitly for a free rate. Credentials stay on the server.",
                  )}
                </p>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() => setOpen(false)}
                >
                  {t("Cancel adding model")}
                </Button>
              </>
            )}
          </GatewayForm>
        </div>
      ) : (
        <Button
          size="sm"
          icon={<Plus aria-hidden="true" className="h-4 w-4" />}
          onClick={() => {
            setOpen(true);
            setSaved(false);
          }}
        >
          {t("Add model")}
        </Button>
      )}
    </div>
  );
}
