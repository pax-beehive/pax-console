"use client";

import { LoaderCircle, RefreshCw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SessionSettings, useSessionSettings } from "./session-settings";
import {
  SettingsToggle,
  SettingsRow,
  SettingsChoice,
  SettingsChoices,
} from "@/components/ui/settings-controls";
import type {
  SessionConfigOption,
  SessionConfiguration,
} from "@/features/api/types";

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

export function SessionConfigSelector(props: SessionConfigSelectorProps) {
  const settings = useSessionSettings();
  const model = configurationModel(props.configuration);
  if (!settings)
    return (
      <SessionSettings
        trigger={
          <Button
            aria-label={`Session configuration${model ? `, model ${model}` : ""}`}
            type="button"
            variant="ghost"
            size="sm"
            disabled={props.disabled}
            icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
          >
            {model ?? "Config"}
          </Button>
        }
      >
        <SessionConfigSelector {...props} />
      </SessionSettings>
    );
  return <SessionConfigFields {...props} />;
}

function SessionConfigFields({
  configuration,
  disabled,
  errorMessage,
  loading,
  onChange,
  onRefresh,
  pendingOptionId,
  refreshing,
}: SessionConfigSelectorProps) {
  const settings = useSessionSettings()!;
  const options =
    configuration?.options.filter((option) => !isPermissionOption(option)) ??
    [];
  const option = options.find(
    (option) => settings.page.id === `config:${option.id}`,
  );
  const locked =
    disabled || !configuration?.can_set || Boolean(pendingOptionId);
  if (settings.page.id !== "home") {
    if (!settings.page.id.startsWith("config:")) return null;
    if (!option)
      return (
        <p role="status" className="px-3 py-4 text-sm text-ink-muted">
          This option is no longer available. Go back to settings to refresh.
        </p>
      );
    const candidates = option.options ?? [];
    const values = candidates.some(
      (candidate) => candidate.value === option.current_value,
    )
      ? candidates
      : [
          {
            name: String(option.current_value),
            value: String(option.current_value),
          },
          ...candidates,
        ];
    return (
      <>
        {option.description && (
          <p className="px-3 pb-4 pt-2 text-sm leading-6 text-ink-muted">
            {option.description}
          </p>
        )}
        <SettingsChoices label={option.name}>
          {values.map((candidate) => (
            <SettingsChoice
              key={candidate.value}
              label={candidate.name}
              description={candidate.group}
              tooltip={candidate.description}
              selected={candidate.value === option.current_value}
              disabled={locked}
              onClick={() => {
                if (candidate.value !== option.current_value)
                  onChange(option.id, candidate.value);
                settings.finish();
              }}
            />
          ))}
        </SettingsChoices>
      </>
    );
  }
  return (
    <>
      <div className="flex items-center justify-between px-3 pb-2">
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
        <p className="px-3 pb-3 text-sm text-ink-muted">
          Loading configuration...
        </p>
      )}
      {errorMessage && (
        <p role="alert" className="px-3 pb-3 text-sm text-danger">
          {errorMessage}
        </p>
      )}
      {!loading &&
        !options.length &&
        !configuration?.legacy_models?.available?.length &&
        !errorMessage && (
          <p className="px-3 pb-3 text-sm text-ink-muted">
            This agent has not reported model or session configuration for this
            session.
          </p>
        )}
      <div className="grid gap-1">
        {options.map((option) =>
          option.type === "boolean" ? (
            <SettingsToggle
              key={option.id}
              label={option.name}
              tooltip={option.description}
              checked={Boolean(option.current_value)}
              disabled={locked}
              onChange={(checked) => onChange(option.id, checked)}
            />
          ) : (
            <SettingsRow
              key={option.id}
              label={option.name}
              value={optionValueLabel(option)}
              tooltip={option.description}
              ariaLabel={`${option.name}: ${optionValueLabel(option)}`}
              disabled={locked}
              onClick={() =>
                settings.navigate({
                  id: `config:${option.id}`,
                  title: option.name,
                })
              }
            />
          ),
        )}
      </div>
      {!options.some(isModelOption) &&
        Boolean(configuration?.legacy_models?.available?.length) && (
          <div>
            <SettingsRow
              label="Model"
              value={configurationModel(configuration)}
              ariaLabel="Legacy model"
              disabled
              onClick={() => {}}
            />
            <SettingsChoices label="Legacy models">
              {configuration?.legacy_models?.available?.map((candidate) => (
                <SettingsChoice
                  key={candidate.id}
                  label={candidate.name}
                  description={candidate.description}
                  selected={
                    configuration?.legacy_models?.current_model_id ===
                    candidate.id
                  }
                  disabled
                  onClick={() => {}}
                />
              ))}
            </SettingsChoices>
            <p className="px-3 pb-3 text-xs leading-5 text-ink-tertiary">
              Legacy agent model list; switching is not standardized.
            </p>
          </div>
        )}
    </>
  );
}
