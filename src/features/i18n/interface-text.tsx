"use client";
import { useI18n } from "./use-i18n";

/** Interface copy in server-rendered route loading boundaries. */
export function InterfaceText({ children }: { children: string }) {
  const { t } = useI18n();
  return t(children);
}
