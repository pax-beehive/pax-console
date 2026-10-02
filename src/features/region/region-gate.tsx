"use client";
import { ReactNode, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  bootstrapRegion,
  loadRegionConfig,
  measureRegions,
  type Region,
} from "./bootstrap";
const bootstrapKey = ["region", "bootstrap"];
export function RegionGate({ children }: { children: ReactNode }) {
  const config = useQuery({
    queryKey: ["region", "config"],
    queryFn: loadRegionConfig,
    staleTime: Infinity,
    retry: false,
  });
  const origin = config.data?.enabled ? config.data.origin : undefined;
  const redirect =
    !!origin &&
    typeof window !== "undefined" &&
    origin !== window.location.origin;
  useEffect(() => {
    if (redirect && origin)
      window.location.replace(
        origin +
          window.location.pathname +
          window.location.search +
          window.location.hash,
      );
  }, [redirect, origin]);
  if (config.isPending || redirect)
    return <RegionMessage>Checking your region...</RegionMessage>;
  if (config.isError)
    return (
      <RegionFailure
        retry={() => void config.refetch()}
        message={config.error.message}
      />
    );
  if (!config.data.enabled) return children;
  return <RegionBootstrap>{children}</RegionBootstrap>;
}
function RegionBootstrap({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const bootstrap = useQuery({
    queryKey: bootstrapKey,
    queryFn: () => bootstrapRegion(),
    staleTime: 20 * 60 * 1000,
    refetchInterval: 20 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const probes = useQuery({
    queryKey: ["region", "probes"],
    queryFn: measureRegions,
    enabled: bootstrap.data?.status === "selection_required",
    staleTime: 30000,
    retry: false,
  });
  const choose = useMutation({
    mutationFn: (region: Region) => bootstrapRegion(region),
    onSuccess: (data) => client.setQueryData(bootstrapKey, data),
  });
  if (bootstrap.isPending)
    return <RegionMessage>Restoring your account...</RegionMessage>;
  if (bootstrap.isError)
    return (
      <RegionFailure
        retry={() => void bootstrap.refetch()}
        message={bootstrap.error.message}
      />
    );
  if (bootstrap.data.status === "ready") return children;
  return (
    <RegionMessage>
      <h1 className="text-2xl font-semibold text-ink">
        Choose your account region
      </h1>
      <p className="mt-3 text-sm leading-6 text-ink-muted">
        Your projects and devices will stay in this region. We recommend the
        fastest available connection.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {(["us", "hk"] as const).map((region) => (
          <Button
            key={region}
            variant={
              probes.data?.recommended === region ? "primary" : "secondary"
            }
            disabled={
              choose.isPending ||
              probes.isFetching ||
              !probes.data ||
              probes.data[region] === null
            }
            onClick={() => choose.mutate(region)}
          >
            {region === "hk" ? "Hong Kong" : "United States"}
            {probes.data?.recommended === region ? " · Recommended" : ""}
          </Button>
        ))}
      </div>
      <p role="status" className="mt-3 text-sm text-ink-subtle">
        {choose.isPending
          ? "Preparing your account..."
          : probes.isFetching
            ? "Checking regional connections..."
            : probes.data?.recommended
              ? `US: ${probes.data.us === null ? "Unavailable" : probes.data.us + " ms"} · Hong Kong: ${probes.data.hk === null ? "Unavailable" : probes.data.hk + " ms"}`
              : "Neither region is reachable. Please retry."}
      </p>
      {choose.isError && (
        <p role="alert" className="mt-3 text-sm text-warning">
          {choose.error.message}
        </p>
      )}
      <Button
        className="mt-4"
        disabled={choose.isPending || probes.isFetching}
        onClick={() => void probes.refetch()}
      >
        Check again
      </Button>
    </RegionMessage>
  );
}
function RegionMessage({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas p-6 text-ink">
      <section className="w-full max-w-lg rounded-lg border border-hairline bg-surface-1 p-6">
        {children}
      </section>
    </div>
  );
}
function RegionFailure({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <RegionMessage>
      <h1 className="text-xl font-semibold">Unable to open your account</h1>
      <p role="alert" className="mt-3 text-sm text-ink-muted">
        {message}
      </p>
      <div className="mt-5 flex gap-3">
        <Button onClick={retry}>Retry</Button>
        <Button asChild>
          <a href="/cdn-cgi/access/logout">Sign in again</a>
        </Button>
      </div>
    </RegionMessage>
  );
}
