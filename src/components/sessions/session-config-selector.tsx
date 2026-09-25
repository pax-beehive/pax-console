"use client";

import { LoaderCircle, RefreshCw, SlidersHorizontal } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type {
  SessionConfigOption,
  SessionConfiguration,
} from "@/features/api/types";

type SessionConfigSelectorProps = {
  configuration?: SessionConfiguration;
  inline?: boolean;
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

export function configurationModel(configuration?: SessionConfiguration) {
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
  inline = false,
}: SessionConfigSelectorProps) {
  const options =
    configuration?.options.filter((option) => !isPermissionOption(option)) ??
    [];
  const model = configurationModel(configuration);
  const content = (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-tertiary">Agent configuration</span>
        <Button
          aria-label="Force refresh session configuration"
          variant="ghost"
          size="icon"
          type="button"
          disabled={!configuration?.can_force_refresh || refreshing}
          onClick={onRefresh}
          icon={
            refreshing ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )
          }
        />
      </div>
      {loading && !options.length && (
        <p className="text-xs text-ink-tertiary">Loading configuration...</p>
      )}
      {errorMessage && (
        <p role="alert" className="text-xs text-danger">
          {errorMessage}
        </p>
      )}
      {!loading &&
        !options.length &&
        !configuration?.legacy_models?.available?.length &&
        !errorMessage && (
          <p className="text-xs text-ink-tertiary">
            This agent has not reported model or session configuration for this
            session.
          </p>
        )}
      {options.map((option) => (
        <label
          key={option.id}
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 border-b border-hairline py-2 text-sm"
        >
          <span className="min-w-0" title={option.description}>
            {option.name}
          </span>
          {option.type === "boolean" ? (
            <Switch
              aria-label={option.name}
              className="justify-self-end"
              checked={Boolean(option.current_value)}
              disabled={
                disabled || !configuration?.can_set || Boolean(pendingOptionId)
              }
              onCheckedChange={(checked) => onChange(option.id, checked)}
            />
          ) : (
            <select
              aria-label={option.name}
              value={String(option.current_value)}
              disabled={
                disabled || !configuration?.can_set || Boolean(pendingOptionId)
              }
              onChange={(event) => onChange(option.id, event.target.value)}
              className="min-w-0 truncate rounded-md bg-surface-3 px-2 py-2 text-base text-ink outline-none [color-scheme:dark] sm:text-sm"
            >
              {!option.options?.some(
                (candidate) => candidate.value === option.current_value,
              ) && (
                <option value={String(option.current_value)}>
                  {String(option.current_value)}
                </option>
              )}
              {option.options?.map((candidate) => (
                <option key={candidate.value} value={candidate.value}>
                  {candidate.group ? `${candidate.group} · ` : ""}
                  {candidate.name}
                </option>
              ))}
            </select>
          )}
        </label>
      ))}
      {!options.some(isModelOption) &&
      configuration?.legacy_models?.available?.length ? (
        <label className="grid gap-2 text-xs text-ink-tertiary">
          Model
          <select
            aria-label="Legacy model"
            disabled
            value={configuration.legacy_models.current_model_id ?? ""}
            className="min-w-0 bg-surface-3 p-2 text-ink"
          >
            {configuration.legacy_models.available.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
          Legacy agent model list; switching is not standardized.
        </label>
      ) : null}
    </div>
  );
  return inline ? (
    content
  ) : (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={`Session configuration${model ? `, model ${model}` : ""}`}
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
        >
          {model ?? "Config"}
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start">
        {content}
      </PopoverContent>
    </Popover>
  );
}
