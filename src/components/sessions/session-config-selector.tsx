"use client";

import {
  Check,
  LoaderCircle,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  SessionConfigOption,
  SessionConfiguration,
} from "@/features/api/types";
import { cn } from "@/lib/utils";

type SessionConfigSelectorProps = {
  configuration?: SessionConfiguration;
  disabled?: boolean;
  errorMessage?: string;
  loading?: boolean;
  onChange: (configId: string, value: string | boolean) => void;
  onRefresh: () => void;
  pendingOptionId?: string;
  refreshing?: boolean;
};

function isPermissionOption(option: SessionConfigOption) {
  return (
    option.category?.toLowerCase() === "mode" ||
    option.id.toLowerCase() === "mode"
  );
}

function isModelOption(option: SessionConfigOption) {
  const id = option.id.toLowerCase();
  return (
    option.category?.toLowerCase() === "model" ||
    id === "model" ||
    id === "models"
  );
}

function optionValueLabel(option: SessionConfigOption) {
  if (typeof option.current_value === "boolean") {
    return option.current_value ? "On" : "Off";
  }
  return (
    option.options?.find(
      (candidate) => candidate.value === option.current_value,
    )?.name ?? option.current_value
  );
}

function configurationModel(configuration?: SessionConfiguration) {
  const modelOption = configuration?.options.find(isModelOption);
  if (modelOption) {
    return optionValueLabel(modelOption);
  }
  const current = configuration?.legacy_models?.current_model_id;
  return (
    configuration?.legacy_models?.available?.find(
      (model) => model.id === current,
    )?.name ?? current
  );
}

export function SessionConfigSelector({
  configuration,
  disabled,
  errorMessage,
  loading,
  onChange,
  onRefresh,
  pendingOptionId,
  refreshing,
}: SessionConfigSelectorProps) {
  const options =
    configuration?.options.filter((option) => !isPermissionOption(option)) ??
    [];
  const model = configurationModel(configuration);
  const hasLegacyModels = Boolean(
    configuration?.legacy_models?.available?.length,
  );
  const hasConfiguration = options.length > 0 || hasLegacyModels;
  const observedAt = configuration?.observed_at
    ? new Date(configuration.observed_at).toLocaleString()
    : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`Session configuration${model ? `, model ${model}` : ""}`}
          className="min-h-9 min-w-0 max-w-28 shrink gap-1 rounded-lg px-1.5 sm:max-w-56 sm:px-2"
          disabled={disabled}
          icon={<SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />}
          size="sm"
          tooltip={model ? `Current model: ${model}` : "Session configuration"}
          type="button"
          variant="ghost"
        >
          <span className="max-w-36 truncate text-xs">{model ?? "Config"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        className="max-h-[min(70vh,640px)] w-96 max-w-[calc(100vw-24px)] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3 px-2.5 py-2">
          <div className="min-w-0">
            <div className="text-sm font-medium text-ink">
              Session configuration
            </div>
            <div className="mt-0.5 text-xs leading-4 text-ink-tertiary">
              {observedAt
                ? `Observed ${observedAt}`
                : "Waiting for the agent to report configuration"}
            </div>
          </div>
          <Button
            aria-label="Force refresh session configuration"
            disabled={!configuration?.can_force_refresh || refreshing}
            icon={
              refreshing ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )
            }
            onClick={onRefresh}
            size="icon"
            tooltip="Ask the agent for a complete snapshot by reapplying the current model value"
            type="button"
            variant="ghost"
          />
        </div>

        {loading && !hasConfiguration && (
          <div className="px-2.5 py-3 text-xs text-ink-tertiary">
            Loading configuration...
          </div>
        )}
        {errorMessage && (
          <div className="mx-2 mb-2 rounded-md border border-danger/30 bg-danger/5 px-2.5 py-2 text-xs text-danger">
            {errorMessage}
          </div>
        )}
        {!loading && !hasConfiguration && !errorMessage && (
          <div className="px-2.5 py-3 text-xs leading-5 text-ink-tertiary">
            This agent has not reported model or session configuration for this
            session.
          </div>
        )}

        {options.map((option, optionIndex) => (
          <div key={option.id}>
            {(optionIndex > 0 || hasLegacyModels) && (
              <div
                className="mx-2 my-1 border-t border-hairline"
                role="separator"
              />
            )}
            <div className="px-2.5 pb-1 pt-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-ink">
                  {option.name}
                </span>
                <span className="max-w-48 truncate font-mono text-[11px] text-ink-tertiary">
                  {String(option.current_value)}
                </span>
              </div>
              {option.description && (
                <div className="mt-0.5 text-xs leading-4 text-ink-tertiary">
                  {option.description}
                </div>
              )}
            </div>
            {option.type === "boolean"
              ? [false, true].map((value) => (
                  <ConfigValueItem
                    checked={option.current_value === value}
                    disabled={
                      !configuration?.can_set || Boolean(pendingOptionId)
                    }
                    key={String(value)}
                    label={value ? "On" : "Off"}
                    onSelect={() => onChange(option.id, value)}
                  />
                ))
              : option.options?.map((candidate, index) => (
                  <div key={candidate.value}>
                    {candidate.group &&
                      (index === 0 ||
                        option.options?.[index - 1]?.group !==
                          candidate.group) && (
                        <div className="px-8 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-ink-tertiary">
                          {candidate.group}
                        </div>
                      )}
                    <ConfigValueItem
                      checked={option.current_value === candidate.value}
                      description={candidate.description}
                      disabled={
                        !configuration?.can_set || Boolean(pendingOptionId)
                      }
                      label={candidate.name}
                      onSelect={() => onChange(option.id, candidate.value)}
                    />
                  </div>
                ))}
          </div>
        ))}

        {hasLegacyModels && !options.some(isModelOption) && (
          <div>
            <div className="px-2.5 pb-1 pt-2">
              <div className="text-xs font-medium text-ink">Model</div>
              <div className="mt-0.5 text-xs text-ink-tertiary">
                Legacy agent model list; switching is not standardized.
              </div>
            </div>
            {configuration?.legacy_models?.available?.map((candidate) => (
              <ConfigValueItem
                checked={
                  configuration.legacy_models?.current_model_id === candidate.id
                }
                description={candidate.description}
                disabled
                key={candidate.id}
                label={candidate.name}
                onSelect={() => undefined}
              />
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ConfigValueItem({
  checked,
  description,
  disabled,
  label,
  onSelect,
}: {
  checked: boolean;
  description?: string;
  disabled?: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      aria-checked={checked}
      className="items-start"
      disabled={disabled}
      onSelect={onSelect}
      role="menuitemradio"
    >
      <Check
        aria-hidden="true"
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          checked ? "opacity-100" : "opacity-0",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ink">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs leading-4 text-ink-tertiary">
            {description}
          </span>
        )}
      </span>
    </DropdownMenuItem>
  );
}
