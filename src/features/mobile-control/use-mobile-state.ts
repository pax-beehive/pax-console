"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { mobileControl, type MobileState } from "./api";

export const mobileStateKey = (userId: string, nodeId: string) =>
  ["user", userId, "node", nodeId, "mobile-control"] as const;

export function useMobilePanelActive(onInactive?: () => void) {
  const [active, setActive] = useState(true);
  const inactive = useEffectEvent(() => onInactive?.());
  useEffect(() => {
    const hide = () => {
      setActive(false);
      inactive();
    };
    const focus = () => setActive(document.visibilityState !== "hidden");
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : focus();
    window.addEventListener("blur", hide);
    window.addEventListener("pagehide", hide);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visibility);
    visibility();
    return () => {
      window.removeEventListener("blur", hide);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return active;
}

export function useMobileState(
  userId: string,
  nodeId: string,
  active: boolean,
) {
  return useQuery({
    queryKey: mobileStateKey(userId, nodeId),
    queryFn: ({ signal }) =>
      mobileControl<MobileState>(userId, nodeId, "state", {}, signal),
    enabled: active,
    retry: false,
    refetchInterval: active ? 5000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    gcTime: 0,
  });
}
