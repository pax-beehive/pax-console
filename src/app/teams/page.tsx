import { redirect } from "next/navigation";
import { TeamsPageRoute } from "@/components/collaboration/teams-page-client";

export const dynamic = "force-dynamic";

type TeamsPageProps = {
  searchParams: Promise<{ view?: string | string[] }>;
};

export default async function TeamsPage({ searchParams }: TeamsPageProps) {
  const { view } = await searchParams;
  // Legacy /teams?view=friends links predate the dedicated /friends route.
  if (view === "friends") {
    redirect("/friends");
  }

  return <TeamsPageRoute />;
}
