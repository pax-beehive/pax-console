import { translators, type Locale } from "@/features/i18n/translate";
import { ApiError, AuthError } from "@/features/api/errors";

export function isSummaryAccessDenied(error: unknown) {
  return (
    error instanceof AuthError ||
    (error instanceof ApiError && [401, 403].includes(error.status))
  );
}

export function summaryDate(value: string, locale?: Locale) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? translators[locale ?? "en"]("Unknown date")
    : date.toLocaleString(locale);
}
