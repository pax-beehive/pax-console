"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Loader2,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { approvePaxlDeviceLogin } from "@/features/api/resources";
import { User } from "@/features/api/types";
import { AuthGate } from "@/features/auth/auth-gate";

const userCodePattern = /^[A-Z0-9]{6}$/;

export function PaxlLoginPageClient() {
  const searchParams = useSearchParams();
  const initialCode = useMemo(
    () => normalizeUserCode(searchParams.get("code") ?? ""),
    [searchParams],
  );

  return (
    <AuthGate>
      {(user) => <PaxlLoginShell initialCode={initialCode} user={user} />}
    </AuthGate>
  );
}

function PaxlLoginShell({
  initialCode,
  user,
}: {
  initialCode: string;
  user: User;
}) {
  const [userCode, setUserCode] = useState(initialCode);
  const isValidCode = userCodePattern.test(userCode);
  const approve = useMutation({
    mutationFn: () => approvePaxlDeviceLogin(user.user_id, userCode),
  });
  const userLabel = user.email ?? user.name ?? user.user_id;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isValidCode && !approve.isPending) {
      approve.mutate();
    }
  }

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto grid min-h-screen w-full max-w-4xl grid-cols-1 content-center gap-8 px-6 py-6 md:grid-cols-[minmax(0,1fr)_360px] md:px-8">
        <section className="min-w-0">
          <header className="border-b border-hairline pb-5">
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-tertiary">
              paxl login
            </div>
            <div className="mt-4 text-sm text-ink-tertiary">
              Hello{" "}
              <span className="font-mono italic text-cyan-300">
                {userLabel}
              </span>
              ,
            </div>
            <h1 className="mt-2 text-3xl font-medium leading-[1.14] text-ink md:text-[2.6rem]">
              Authorize this CLI.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-ink-muted">
              PAX Manager will issue a user API key to the paxl process waiting
              in your terminal.
            </p>
          </header>

          <section className="mt-5">
            <div className="flex items-center justify-between gap-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2 text-[15px] font-medium">
                <TerminalSquare className="h-4 w-4 text-primary-hover" />
                CLI identity
              </div>
              <div className="shrink-0 text-[11px] uppercase tracking-[0.08em] text-ink-tertiary">
                User scoped
              </div>
            </div>

            <div className="grid border-t border-l border-hairline sm:grid-cols-2">
              <DetailRow
                icon={<TerminalSquare className="h-4 w-4" />}
                label="Client"
                value="paxl"
              />
              <DetailRow
                icon={<KeyRound className="h-4 w-4" />}
                label="Credential"
                value="User API key"
              />
              <DetailRow
                icon={<ShieldCheck className="h-4 w-4" />}
                label="Approving as"
                value={userLabel}
              />
            </div>
          </section>
        </section>

        <aside className="border border-hairline bg-surface-1">
          <div className="border-b border-hairline px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[15px] font-medium">Approve login</div>
              <div className="text-[11px] uppercase tracking-[0.08em] text-ink-tertiary">
                {approve.isSuccess ? "approved" : "pending"}
              </div>
            </div>
          </div>

          <form className="grid gap-5 p-5" onSubmit={onSubmit}>
            <div className="grid gap-2.5">
              <label className="grid gap-2.5 text-xs font-medium text-ink-subtle">
                Login code
                <input
                  autoCapitalize="characters"
                  autoComplete="one-time-code"
                  autoFocus
                  className="h-14 rounded-md border border-hairline bg-surface-2 px-4 text-center font-mono text-2xl font-medium tracking-[0.24em] text-ink outline-none transition placeholder:text-ink-tertiary focus:border-primary"
                  inputMode="text"
                  maxLength={6}
                  onChange={(event) => {
                    setUserCode(normalizeUserCode(event.target.value));
                    approve.reset();
                  }}
                  placeholder="ABC123"
                  value={userCode}
                />
              </label>
              <div className="text-xs leading-5 text-ink-tertiary">
                Use the code shown by the paxl process you started.
              </div>
            </div>

            {approve.error && (
              <div className="border border-warning/30 bg-warning/10 p-3 text-xs leading-5 text-ink-muted">
                {approve.error.message}
              </div>
            )}

            {approve.isSuccess && (
              <div className="border border-success/30 bg-success/10 p-3 text-xs leading-5 text-success">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  paxl login approved
                </div>
                <div className="mt-1 font-mono text-[11px] text-ink-muted">
                  login: {approve.data.login_id}
                </div>
              </div>
            )}

            <Button
              className="w-full justify-center rounded-md"
              disabled={!isValidCode || approve.isPending || approve.isSuccess}
              icon={
                approve.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )
              }
              type="submit"
              variant="primary"
            >
              {approve.isPending ? "Authorizing..." : "Authorize paxl"}
            </Button>
          </form>

          <div className="border-t border-hairline px-5 py-4 text-xs leading-5 text-ink-tertiary">
            <div>
              This code is consumed once paxl receives its local credential.
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 border-r border-b border-hairline px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2 text-[11px] text-ink-tertiary">
        <span className="text-ink-tertiary">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 truncate font-mono text-[12px] text-ink-muted">
        {value}
      </div>
    </div>
  );
}

function normalizeUserCode(value: string) {
  return value
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 6);
}
