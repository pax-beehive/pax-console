import { redirect } from "next/navigation";

export default function ApiKeysPage() {
  redirect("/settings/developer?view=api-keys");
}
