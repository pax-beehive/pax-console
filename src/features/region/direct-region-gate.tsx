"use client";
import { useEffect, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { AuthError } from "@/features/api/errors";
import { SignInRedirect } from "@/features/auth/sign-in-redirect";
import { clearSignInAttempt } from "@/features/auth/sign-in";
import { bootstrapRegion, navigateToRegion, type Region } from "./bootstrap";

const key = ["region", "direct-bootstrap"];
export function DirectRegionGate({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: key,
    queryFn: () => bootstrapRegion(),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  const choose = useMutation({
    mutationFn: (region: Region) => bootstrapRegion(region),
    onSuccess: (data) => client.setQueryData(key, data),
  });
  const result = query.data;
  const destination = result?.status === "ready" ? result.origin : undefined;
  const redirect =
    !!destination &&
    typeof window !== "undefined" &&
    destination !== window.location.origin;
  useEffect(() => {
    if (redirect && destination) navigateToRegion(destination);
    else if (query.isSuccess) clearSignInAttempt();
  }, [redirect, destination, query.isSuccess]);
  if (query.error instanceof AuthError) return <SignInRedirect />;
  if (result?.status === "ready" && !redirect) return children;
  return (
    <div className="grid min-h-screen place-items-center bg-canvas p-6 text-ink">
      <section className="w-full max-w-lg rounded-lg border border-hairline bg-surface-1 p-6">
        {query.isPending || redirect ? (
          <p>Opening your account region...</p>
        ) : query.isError ? (
          <>
            <p role="alert">{query.error.message}</p>
            <Button onClick={() => void query.refetch()}>Retry</Button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">
              Choose your account region
            </h1>
            <p className="my-4 text-ink-muted">
              Your projects and devices will stay in this region. Future visits
              return here automatically.
            </p>
            <div className="flex gap-3">
              {(["hk", "us"] as Region[]).map((region) => (
                <Button
                  key={region}
                  disabled={choose.isPending}
                  onClick={() => choose.mutate(region)}
                >
                  {region === "hk" ? "Hong Kong" : "United States"}
                </Button>
              ))}
            </div>
            {choose.isError && (
              <p role="alert" className="mt-4">
                {choose.error.message}
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
