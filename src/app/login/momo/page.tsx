import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Friendly short link → shared login with the MoMo Agent role preselected.
// Does NOT create a separate auth system; it simply redirects.
export default function LoginMomoRedirect() {
  redirect("/login?role=momo");
}
