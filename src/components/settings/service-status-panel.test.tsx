/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Node } from "@/features/api/types";
import { ServiceStatusPanel } from "./service-status-panel";

afterEach(cleanup);

function renderStatus(nodes: Node[]) {
  render(
    <TooltipProvider>
      <ServiceStatusPanel
        nodes={nodes}
        agents={[]}
        health={{ status: "ok" }}
        loading={false}
        error={false}
        refresh={() => {}}
        refreshing={false}
      />
    </TooltipProvider>,
  );
}

describe("device status", () => {
  it("hides CLI identities and excludes them from counts and offline guidance", () => {
    renderStatus([
      { node_id: "mac", name: "Office Mac", kind: "paxd", online: true },
      { node_id: "cli", name: "CLI identity", kind: "paxl", online: false },
    ]);
    expect(screen.getByRole("link", { name: /Office Mac/ })).toBeVisible();
    expect(screen.queryByText("CLI identity")).not.toBeInTheDocument();
    expect(screen.getByText("1 / 1")).toBeVisible();
    expect(screen.queryByText(/For an offline device/)).not.toBeInTheDocument();
  });

  it("shows an empty device list when only CLI identities exist", () => {
    renderStatus([{ node_id: "cli", kind: "paxl", online: false }]);
    expect(screen.getByText("No devices connected yet.")).toBeVisible();
    expect(screen.getAllByText("0 / 0")).toHaveLength(2);
  });

  it("preserves offline devices without kind even when their name starts with paxl", () => {
    renderStatus([{ node_id: "legacy", name: "paxl-lab", online: false }]);
    expect(screen.getByRole("link", { name: /paxl-lab/ })).toBeVisible();
    expect(screen.getByText("0 / 1")).toBeVisible();
    expect(screen.getByText(/For an offline device/)).toBeVisible();
  });
});
