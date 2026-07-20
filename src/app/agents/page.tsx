import { redirect } from "next/navigation";

export default function AgentsPage() {
  redirect("/settings/devices?view=agents");
}
