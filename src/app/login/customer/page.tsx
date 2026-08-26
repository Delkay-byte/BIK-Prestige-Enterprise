import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Friendly short link → shared login with the role preselected.
// Does NOT create a separate auth system; it simply redirects.
export default function LoginCustomerRedirect() {
  redirect("/login?role=customer");
}
