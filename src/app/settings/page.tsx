import { redirect } from "next/navigation";
import { getAdminSession, getMomoSession, getSusuSession } from "@/lib/auth";

/**
 * Legacy shared settings URL. Forwards to the authenticated person's
 * module-specific settings area (each module keeps its own session).
 */
export default async function LegacySettingsPage() {
  const admin = await getAdminSession();
  if (admin) redirect("/admin/settings");

  const worker = await getMomoSession();
  if (worker) redirect("/worker/settings");

  const collector = await getSusuSession();
  if (collector) redirect("/collector/settings");

  redirect("/login");
}
