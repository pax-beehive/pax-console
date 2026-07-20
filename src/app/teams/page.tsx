import { redirect } from "next/navigation";

type TeamsPageProps = {
  searchParams: Promise<{ view?: string }>;
};

export default async function TeamsPage({ searchParams }: TeamsPageProps) {
  const { view } = await searchParams;
  redirect(
    view === "friends" ? "/collaboration/friends" : "/collaboration/teams",
  );
}
