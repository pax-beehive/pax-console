import { Suspense } from "react";
import { WorkspaceSearchPage } from "@/components/search/workspace-search";

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="p-5 text-sm text-ink-muted" role="status">
          Loading search…
        </div>
      }
    >
      <WorkspaceSearchPage />
    </Suspense>
  );
}
