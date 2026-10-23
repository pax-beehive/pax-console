"use client";

import { createContext, useContext } from "react";
import type { LocalFileTarget } from "./local-file-href";

export type LocalFileFetchRequest = LocalFileTarget & {
  /** Visible link text, used only for dialog context; never as the path. */
  label?: string;
};

export type LocalFileLinkContextValue = {
  userId: string;
  sessionId: string;
  enabled: boolean;
  disabledReason?: string;
  /** Opens the session fetch dialog. Supplied by LocalFileFetchProvider. */
  requestFetch?: (request: LocalFileFetchRequest) => void;
};

/**
 * Session scope for local file links. Without a value (artifact viewer,
 * standalone pages) links are copy-only. Provide `null` explicitly to opt a
 * subtree out of an outer session provider.
 */
export const LocalFileLinkContext =
  createContext<LocalFileLinkContextValue | null>(null);

export function useLocalFileLinkContext() {
  return useContext(LocalFileLinkContext);
}
