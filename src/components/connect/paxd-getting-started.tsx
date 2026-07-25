"use client";

import { useRouter } from "next/navigation";
import { Bot, Server, ShieldCheck, TerminalSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

type PaxdGettingStartedGuideProps = {
  kind: "agent" | "node";
};

type GuideStep = {
  command?: string;
  description: string;
  title: string;
};

const nodeSteps: GuideStep[] = [
  {
    title: "Set up paxd pairing and background service",
    description:
      "Run this on the machine you want to connect. This is the paxl daemon setup flow.",
    command: "paxl daemon setup",
  },
  {
    title: "Approve the pairing request in Console",
    description:
      "When paxd shows a pair code, approve it here so the node can receive its node API key.",
  },
];

const agentSteps: GuideStep[] = [
  {
    title: "Discover harness availability",
    description:
      "Probe which local harnesses are installed and reachable before creating a connection.",
    command: "paxl daemon harness discover --probe codex claude",
  },
  {
    title: "Create a local daemon agent connection",
    description:
      "Use the harness you want to run. This is the paxl daemon command for creating the connection.",
    command: "paxl daemon agent create --remote default --harness codex --name work",
  },
  {
    title: "Verify the connection",
    description:
      "Check that paxd created the connection and that the new agent shows up in Console.",
    command: "paxl daemon agent list",
  },
];

export function PaxdGettingStartedGuide({
  kind,
}: PaxdGettingStartedGuideProps) {
  const router = useRouter();
  const isNodeGuide = kind === "node";
  const steps = isNodeGuide ? nodeSteps : agentSteps;

  return (
    <section className="grid gap-4 rounded-xl border border-hairline bg-surface-1 p-5">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-hairline bg-canvas text-primary-hover">
          {isNodeGuide ? (
            <Server className="h-5 w-5" />
          ) : (
            <Bot className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.08em] text-ink-tertiary">
            paxl daemon guide
          </div>
          <h2 className="mt-1 text-lg font-medium text-ink">
            {isNodeGuide
              ? "No nodes connected yet"
              : "No agents created on this fleet yet"}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">
            {isNodeGuide
              ? "Start by connecting a machine with paxd. After the node is online, you can discover harnesses and create agent connections."
              : "Your node is online, but paxd does not have any local agent connections yet. The paxl commands below are the quickest way to create the first one."}
          </p>
        </div>
      </div>

      <div className="grid gap-3">
        {steps.map((step, index) => (
          <div
            className="rounded-lg border border-hairline bg-canvas p-4"
            key={step.title}
          >
            <div className="flex min-w-0 items-start gap-3">
              <div className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-hairline bg-surface-1 font-mono text-xs text-ink-tertiary">
                {index + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ink">{step.title}</div>
                <p className="mt-1 text-sm leading-6 text-ink-muted">
                  {step.description}
                </p>
                {step.command && (
                  <div className="mt-3 overflow-x-auto rounded-md border border-hairline bg-surface-1 px-3 py-2">
                    <code className="block whitespace-pre-wrap break-all font-mono text-xs text-ink-muted">
                      {step.command}
                    </code>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-hairline pt-1">
        {isNodeGuide ? (
          <>
            <Button
              icon={<ShieldCheck className="h-4 w-4" />}
              onClick={() => router.push("/connect")}
              size="sm"
              type="button"
              variant="primary"
            >
              Open pairing page
            </Button>
            <Button
              icon={<TerminalSquare className="h-4 w-4" />}
              onClick={() => router.push("/settings/node-registration")}
              size="sm"
              type="button"
              variant="secondary"
            >
              Create registration token
            </Button>
          </>
        ) : (
          <Button
            icon={<Server className="h-4 w-4" />}
            onClick={() => router.push("/nodes")}
            size="sm"
            type="button"
            variant="primary"
          >
            Open nodes
          </Button>
        )}
      </div>
    </section>
  );
}
