"use client";

import { Check, ChevronDown, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SearchBox } from "@/components/ui/search-box";
import { TruncatedText } from "@/components/ui/text";
import { LOGOUT_URL } from "@/features/api/client";
import { User } from "@/features/api/types";
import { isAdminUser } from "@/features/auth/admin-view";
import { useConsoleStore } from "@/stores/console-store";

type TopbarProps = {
  user: User;
};

export function Topbar({ user }: TopbarProps) {
  const previewAsUser = useConsoleStore((state) => state.previewAsUser);
  const setPreviewAsUser = useConsoleStore((state) => state.setPreviewAsUser);
  const isAdmin = isAdminUser(user);

  return (
    <header className="mobile-safe-top flex min-h-[var(--topbar-h)] min-w-0 items-center justify-between gap-2 border-b border-hairline bg-canvas/95 px-3 backdrop-blur sm:gap-4 sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {isAdmin && !previewAsUser && (
          <SearchBox
            className="hidden w-full max-w-[340px] sm:flex"
            placeholder="Search threads and resources"
          />
        )}
      </div>
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="User menu"
              className="flex h-9 w-9 min-w-0 items-center justify-center gap-2 rounded-md border border-transparent px-2 py-1 text-left transition hover:border-hairline hover:bg-surface-1 data-[state=open]:border-hairline data-[state=open]:bg-surface-1 sm:h-auto sm:w-auto sm:justify-start"
              type="button"
            >
              <span className="hidden min-w-0 sm:block">
                <span className="block text-xs text-ink-tertiary">
                  Signed in
                </span>
                <TruncatedText className="block max-w-44 text-sm text-ink-muted">
                  {user.email ?? user.name ?? user.user_id}
                </TruncatedText>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-ink-tertiary" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {isAdmin && (
              <DropdownMenuItem
                onSelect={() => setPreviewAsUser(!previewAsUser)}
              >
                <Check
                  className={`h-4 w-4 shrink-0 ${
                    previewAsUser ? "text-success" : "opacity-0"
                  }`}
                />
                Preview as user
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() => {
                window.location.assign(LOGOUT_URL);
              }}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
