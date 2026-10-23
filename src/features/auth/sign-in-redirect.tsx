"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { PaxLogo } from "@/components/ui/pax-logo";
import { LOGIN_URL } from "@/features/api/client";
import { currentSignInUrl, startSignIn } from "./sign-in";

export function SignInRedirect() {
  const started = useRef(false);
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (link.current) link.current.href = currentSignInUrl();
    startSignIn();
  }, []);

  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-6 py-12 text-ink">
      <section className="w-full max-w-sm">
        <div className="mb-12 flex items-center gap-2 text-sm font-medium tracking-wide">
          <PaxLogo className="-ml-3 size-14 text-accent" />
          PAX Workspace
        </div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-subtle">
          Your agents. One workspace.
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          Welcome to PAX.
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted" role="status">
          Taking you to sign in with email, Google, or GitHub.
        </p>
        <Button asChild className="mt-7" variant="primary">
          <a ref={link} href={LOGIN_URL}>
            Continue to sign in
          </a>
        </Button>
        <a
          className="mt-12 block text-xs text-ink-subtle hover:text-ink"
          href="/overview"
        >
          Explore PaxWorkspace ↗
        </a>
      </section>
    </main>
  );
}
