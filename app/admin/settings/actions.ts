"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSystemAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { putSecret, SECRET_KEYS } from "@/lib/secrets";
import { syncModelCatalogue } from "@/lib/openrouter";

function ok(message: string): never {
  redirect(`/admin/settings?ok=${encodeURIComponent(message)}`);
}
function fail(message: string): never {
  redirect(`/admin/settings?error=${encodeURIComponent(message)}`);
}

export async function saveOpenRouterKey(formData: FormData) {
  const { user } = await requireSystemAdmin();
  const value = String(formData.get("api_key") ?? "").trim();
  if (!value) fail("API key is required.");
  if (!/^sk-or-/.test(value)) fail("That doesn't look like an OpenRouter key (expected sk-or-…).");

  try {
    await putSecret(
      SECRET_KEYS.OPENROUTER_API_KEY,
      value,
      user.id,
      "OpenRouter API key — used by lib/llm.ts and lib/openrouter.ts."
    );
  } catch (err) {
    fail(err instanceof Error ? err.message : "Could not save the key.");
  }

  await auditUpdate(user.id, "system_secret", "OPENROUTER_API_KEY", { action: "secret updated" });

  revalidatePath("/admin/settings");
  ok("OpenRouter key saved.");
}

export async function saveDefaultModels(formData: FormData) {
  const { user } = await requireSystemAdmin();
  const primary = optionalSlug(formData.get("primary"));
  const fallback1 = optionalSlug(formData.get("fallback1"));
  const fallback2 = optionalSlug(formData.get("fallback2"));

  const admin = createAdminClient();
  const { error } = await admin
    .from("system_settings")
    .update({
      default_primary_model_slug: primary,
      default_fallback_1_model_slug: fallback1,
      default_fallback_2_model_slug: fallback2,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);

  if (error) fail(`Could not save defaults: ${error.message}`);

  await auditUpdate(user.id, "system_settings", "global", {
    primary,
    fallback1,
    fallback2,
  });

  revalidatePath("/admin/settings");
  ok("Defaults saved.");
}

export async function refreshModelCatalogue() {
  const { user } = await requireSystemAdmin();
  const result = await syncModelCatalogue();
  if (!result.ok) fail(result.error);

  await auditUpdate(user.id, "openrouter_models", "*", {
    action: "catalogue sync",
    fetched: result.fetched,
  });

  revalidatePath("/admin/settings");
  ok(`Synced ${result.fetched} models.`);
}

function optionalSlug(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : null;
}

async function auditUpdate(
  actorId: string,
  entity: string,
  entityId: string,
  diff: Record<string, unknown>
) {
  const admin = createAdminClient();
  await admin.from("admin_audit_log").insert({
    actor_id: actorId,
    entity,
    entity_id: entityId,
    action: "update",
    diff,
  });
}
