"use client";

import { ReactNode } from "react";
import { API_BASE_URL, LOGIN_URL } from "@/features/api/client";
import { AuthError } from "@/features/api/errors";
import { User } from "@/features/api/types";
import { useCurrentUser } from "./use-current-user";
import { SignInRedirect } from "./sign-in-redirect";

type AuthGateProps = {
  children: (user: User) => ReactNode;
};

export function AuthGate({ children }: AuthGateProps) {
  const currentUser = useCurrentUser();

  if (currentUser.error instanceof AuthError) return <SignInRedirect />;

  if (currentUser.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas text-ink">
        <div className="rounded-lg border border-hairline bg-surface-1 p-5">
          <div className="text-sm text-ink-muted">Checking PAX access...</div>
        </div>
      </div>
    );
  }

  if (currentUser.isError || !currentUser.data) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas p-6 text-ink">
        <section className="w-full max-w-xl rounded-lg border border-hairline bg-surface-1 p-6">
          <div className="text-sm font-medium text-ink-subtle">
            PAX Workspace
          </div>
          <h1 className="mt-3 text-3xl font-semibold leading-tight">
            Sign in to open PAX Console.
          </h1>
          <p className="mt-3 text-sm leading-6 text-ink-muted">
            Continue with your email, Google, or GitHub account.
          </p>
          <div className="mt-5 rounded-lg border border-hairline bg-canvas p-3 font-mono text-xs leading-5 text-ink-subtle">
            {formatAuthError(currentUser.error)}
          </div>
          <a
            className="mt-5 inline-flex min-h-9 items-center rounded-lg border border-primary bg-primary px-3 text-sm font-medium text-canvas hover:bg-primary-hover"
            href={LOGIN_URL}
          >
            Sign in
          </a>
        </section>
      </div>
    );
  }

  return children(currentUser.data);
}

function formatAuthError(error: Error | null) {
  if (!error) {
    return "No user profile returned from /api/v1/user/self/me.";
  }

  if (error instanceof AuthError) {
    return "Your sign-in has expired. Sign in again to continue.";
  }

  return `${error.name}: ${error.message}; API base: ${API_BASE_URL}`;
}
