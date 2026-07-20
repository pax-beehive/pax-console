import { redirect } from "next/navigation";

export default function NodeRegistrationPage() {
  redirect("/settings/developer?view=node-registration");
}
