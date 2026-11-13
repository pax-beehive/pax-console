"use client";
import { useI18n } from "@/features/i18n/use-i18n";

import { ReactNode } from "react";
import { API_BASE_URL } from "@/features/api/client";
import { AuthError } from "@/features/api/errors";
import { User } from "@/features/api/types";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "./use-current-user";
import { SignInRedirect } from "./sign-in-redirect";

type AuthGateProps = {
  children: (user: User) => ReactNode;
};

export function AuthGate({ children }: AuthGateProps) {
  const { t } = useI18n();
  const currentUser = useCurrentUser();

  if (currentUser.error instanceof AuthError) return <SignInRedirect />;

  if (currentUser.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas text-ink">
        <div className="rounded-lg border border-hairline bg-surface-1 p-5">
          <div className="text-sm text-ink-muted">
            {t("Checking PAX access...")}
          </div>
        </div>
      </div>
    );
  }

  if (currentUser.isError || !currentUser.data) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas p-6 text-ink">
        <section className="w-full max-w-xl rounded-lg border border-hairline bg-surface-1 p-6">
          <div className="text-sm font-medium text-ink-subtle">
            {t("PAX Workspace")}
          </div>
          <h1 className="mt-3 text-3xl font-semibold leading-tight">
            {t("Unable to load your account.")}
          </h1>
          <p className="mt-3 text-sm leading-6 text-ink-muted">
            {t(
              "PAX could not load your account information. Retry to continue.",
            )}
          </p>
          <div
            role="alert"
            className="mt-5 rounded-lg border border-hairline bg-canvas p-3 font-mono text-xs leading-5 text-ink-subtle"
          >
            {formatAccountError(currentUser.error)}
          </div>
          <Button
            className="mt-5"
            disabled={currentUser.isFetching}
            onClick={() => void currentUser.refetch()}
            variant="primary"
          >
            {t("Retry")}
          </Button>
        </section>
      </div>
    );
  }

  return children(currentUser.data);
}

function formatAccountError(error: Error | null) {
  if (!error) {
    return "No user profile returned from /api/v1/user/self/me.";
  }

  return `${error.name}: ${error.message}; API base: ${API_BASE_URL}`;
}
