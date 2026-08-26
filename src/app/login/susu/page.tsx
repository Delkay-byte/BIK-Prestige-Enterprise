import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Friendly short link → shared login with the Susu Collector role preselected.
// Does NOT create a separate auth system; it simply redirects.
export default function LoginSusuRedirect() {
  redirect("/login?role=susu");
}
