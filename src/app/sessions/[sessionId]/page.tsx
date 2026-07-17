import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SessionPageProps = {
  params: Promise<{
    sessionId: string;
  }>;
};

export default async function SessionPage({ params }: SessionPageProps) {
  const { sessionId } = await params;

  if (sessionId === "new") {
    redirect("/");
  }

  const query = new URLSearchParams({ sessionId });
  redirect(`/?${query}`);
}
