import "server-only";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Resolve the current session and confirm system admin status.
 * Per PRD §14.1 non-admins get 404, not 403 — we don't advertise /admin.
 */
export async function requireSystemAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("id, email, is_system_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_system_admin) notFound();

  return { user, profile, supabase };
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("users")
    .select("is_system_admin")
    .eq("id", user.id)
    .maybeSingle();
  return Boolean(data?.is_system_admin);
}
