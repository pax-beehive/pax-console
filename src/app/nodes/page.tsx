import { redirect } from "next/navigation";

export default function NodesPage() {
  redirect("/settings/devices?view=nodes");
}
