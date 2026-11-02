import { ApiError, AuthError } from "@/features/api/errors";

export function isSummaryAccessDenied(error: unknown) {
  return (
    error instanceof AuthError ||
    (error instanceof ApiError && [401, 403].includes(error.status))
  );
}

export function summaryDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
}
