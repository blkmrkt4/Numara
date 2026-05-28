"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSystemAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTestRateLimited, llmCall } from "@/lib/llm";

function ok(slug: string, msg: string): never {
  redirect(`/admin/prompts/${slug}?ok=${encodeURIComponent(msg)}`);
}
function fail(slug: string, msg: string): never {
  redirect(`/admin/prompts/${slug}?error=${encodeURIComponent(msg)}`);
}

async function audit(actorId: string, entityId: string, action: string, diff: Record<string, unknown>) {
  const admin = createAdminClient();
  await admin.from("admin_audit_log").insert({
    actor_id: actorId,
    entity: "prompt",
    entity_id: entityId,
    action,
    diff,
  });
}

// ─────────────────────────────────────────────────────────────────────
// Save everything in one shot. Writes metadata, conditionally inserts a
// new prompt_versions row (only when the body or slugs actually changed),
// and always upserts the binding. The diff check keeps history clean
// when an admin only retuned the model/temperature.
// ─────────────────────────────────────────────────────────────────────
export async function saveAll(formData: FormData) {
  const { user } = await requireSystemAdmin();
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) redirect("/admin/prompts");

  // Body + metadata fields
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const purpose = String(formData.get("purpose") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  const availableSlugsRaw = String(formData.get("available_slugs") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!name) fail(slug, "Name is required.");
  if (!["extraction", "classification", "summary", "other"].includes(purpose)) {
    fail(slug, "Pick a valid purpose.");
  }

  const availableSlugs = availableSlugsRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const s of availableSlugs) {
    if (!/^[a-z][a-z0-9_]*$/i.test(s)) {
      fail(slug, `"${s}" is not a valid slug name (lowercase letters, numbers, underscores).`);
    }
  }

  // Binding fields
  const primary = String(formData.get("primary_model_slug") ?? "").trim();
  const fallback1 = String(formData.get("fallback_1_model_slug") ?? "").trim() || null;
  const fallback2 = String(formData.get("fallback_2_model_slug") ?? "").trim() || null;
  const temperature = Number(formData.get("temperature") ?? 0.2);
  const maxTokens = Number(formData.get("max_tokens") ?? 2048);
  const responseFormat = String(formData.get("response_format") ?? "text");
  const jsonSchemaRaw = String(formData.get("json_schema") ?? "").trim();

  if (!primary) fail(slug, "Primary model is required.");
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    fail(slug, "Temperature must be between 0 and 2.");
  }
  if (!Number.isFinite(maxTokens) || maxTokens < 1 || maxTokens > 200000) {
    fail(slug, "Max tokens must be between 1 and 200000.");
  }
  if (!["text", "json"].includes(responseFormat)) {
    fail(slug, "Response format must be text or json.");
  }
  let jsonSchema: unknown = null;
  if (responseFormat === "json" && jsonSchemaRaw) {
    try {
      jsonSchema = JSON.parse(jsonSchemaRaw);
    } catch {
      fail(slug, "JSON schema is not valid JSON.");
    }
  }

  const admin = createAdminClient();
  const { data: prompt } = await admin
    .from("prompts")
    .select("id, current_version_id")
    .eq("slug", slug)
    .maybeSingle();
  if (!prompt) fail(slug, "Prompt not found.");

  // Update prompts metadata.
  const { error: updErr } = await admin
    .from("prompts")
    .update({ name, description, purpose })
    .eq("id", prompt.id);
  if (updErr) fail(slug, `Could not update prompt: ${updErr.message}`);

  // Decide whether to create a new prompt_versions row by comparing
  // against the current version. Body and slugs are the meaningful diff;
  // notes alone don't justify a new revision (they describe a change).
  let createdVersion = false;
  let newVersionNumber: number | null = null;
  if (prompt.current_version_id) {
    const { data: current } = await admin
      .from("prompt_versions")
      .select("body, available_slugs")
      .eq("id", prompt.current_version_id)
      .maybeSingle();
    const currentSlugs = Array.isArray(current?.available_slugs)
      ? current.available_slugs.slice().sort()
      : [];
    const incomingSlugs = availableSlugs.slice().sort();
    const slugsSame =
      currentSlugs.length === incomingSlugs.length &&
      currentSlugs.every((s, i) => s === incomingSlugs[i]);
    if (current && current.body === body && slugsSame) {
      // No body/slug change — skip version insert.
    } else {
      const { data: maxV } = await admin
        .from("prompt_versions")
        .select("version_number")
        .eq("prompt_id", prompt.id)
        .order("version_number", { ascending: false })
        .limit(1);
      newVersionNumber = (maxV?.[0]?.version_number ?? 0) + 1;
      const { data: newVersion, error: insErr } = await admin
        .from("prompt_versions")
        .insert({
          prompt_id: prompt.id,
          version_number: newVersionNumber,
          body,
          available_slugs: availableSlugs,
          notes,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (insErr) fail(slug, `Could not save version: ${insErr.message}`);
      const { error: ptrErr } = await admin
        .from("prompts")
        .update({ current_version_id: newVersion!.id })
        .eq("id", prompt.id);
      if (ptrErr) fail(slug, `Could not advance version pointer: ${ptrErr.message}`);
      createdVersion = true;
    }
  } else {
    // First version for this prompt.
    newVersionNumber = 1;
    const { data: newVersion, error: insErr } = await admin
      .from("prompt_versions")
      .insert({
        prompt_id: prompt.id,
        version_number: newVersionNumber,
        body,
        available_slugs: availableSlugs,
        notes,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (insErr) fail(slug, `Could not save version: ${insErr.message}`);
    await admin
      .from("prompts")
      .update({ current_version_id: newVersion!.id })
      .eq("id", prompt.id);
    createdVersion = true;
  }

  // Always upsert the binding (cheap; one row).
  const { error: bindErr } = await admin.from("prompt_bindings").upsert({
    prompt_id: prompt.id,
    primary_model_slug: primary,
    fallback_1_model_slug: fallback1,
    fallback_2_model_slug: fallback2,
    temperature,
    max_tokens: maxTokens,
    response_format: responseFormat,
    json_schema: jsonSchema,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  });
  if (bindErr) fail(slug, `Could not save binding: ${bindErr.message}`);

  await audit(user.id, slug, "save_all", {
    created_version: createdVersion,
    version: newVersionNumber,
    primary,
    fallback1,
    fallback2,
    temperature,
    max_tokens: maxTokens,
    response_format: responseFormat,
  });

  revalidatePath(`/admin/prompts/${slug}`);
  ok(
    slug,
    createdVersion
      ? `Saved (new version v${newVersionNumber}).`
      : `Saved (binding only — body unchanged).`
  );
}

// ─────────────────────────────────────────────────────────────────────
// Status toggle (active / disabled). llmCall refuses disabled prompts.
// ─────────────────────────────────────────────────────────────────────
export async function setStatus(formData: FormData) {
  const { user } = await requireSystemAdmin();
  const slug = String(formData.get("slug") ?? "").trim();
  const status = String(formData.get("status") ?? "");
  if (!slug || !["active", "disabled"].includes(status)) {
    redirect("/admin/prompts");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("prompts")
    .update({ status })
    .eq("slug", slug);
  if (error) fail(slug, `Could not update status: ${error.message}`);

  await audit(user.id, slug, "update_status", { status });
  revalidatePath(`/admin/prompts/${slug}`);
  revalidatePath("/admin/prompts");
  ok(slug, `Marked ${status}.`);
}

// ─────────────────────────────────────────────────────────────────────
// Revert: copy a historical version's body into a new top-of-history
// version. We never overwrite an existing version (audit trail intact).
// ─────────────────────────────────────────────────────────────────────
export async function revertToVersion(formData: FormData) {
  const { user } = await requireSystemAdmin();
  const slug = String(formData.get("slug") ?? "").trim();
  const versionId = String(formData.get("version_id") ?? "").trim();
  if (!slug || !versionId) redirect("/admin/prompts");

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("prompt_versions")
    .select("prompt_id, body, available_slugs, version_number")
    .eq("id", versionId)
    .maybeSingle();
  if (!target) fail(slug, "Version not found.");

  const { data: maxV } = await admin
    .from("prompt_versions")
    .select("version_number")
    .eq("prompt_id", target.prompt_id)
    .order("version_number", { ascending: false })
    .limit(1);
  const nextVersion = (maxV?.[0]?.version_number ?? 0) + 1;

  const { data: newVersion, error: insErr } = await admin
    .from("prompt_versions")
    .insert({
      prompt_id: target.prompt_id,
      version_number: nextVersion,
      body: target.body,
      available_slugs: target.available_slugs,
      notes: `Reverted to v${target.version_number}`,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (insErr) fail(slug, `Could not revert: ${insErr.message}`);

  await admin
    .from("prompts")
    .update({ current_version_id: newVersion!.id })
    .eq("id", target.prompt_id);

  await audit(user.id, slug, "revert", { from_version: target.version_number, new_version: nextVersion });
  revalidatePath(`/admin/prompts/${slug}`);
  ok(slug, `Reverted to v${target.version_number} (now v${nextVersion}).`);
}

// ─────────────────────────────────────────────────────────────────────
// Test panel — runs the prompt against its bound primary model.
// Uses a separate per-actor rate limit (PRD §14.8).
// Returns the result inline via querystring rather than a JSON endpoint
// so we keep this as a simple progressive form.
// ─────────────────────────────────────────────────────────────────────
export async function runTest(formData: FormData) {
  const { user } = await requireSystemAdmin();
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) redirect("/admin/prompts");

  const limit = await isTestRateLimited(user.id);
  if (limit.limited) {
    fail(slug, `Rate limited — wait a moment then try again.`);
  }

  // Pull declared slugs to know which form fields to read.
  const admin = createAdminClient();
  const { data: prompt } = await admin
    .from("prompts")
    .select("id, current_version_id")
    .eq("slug", slug)
    .maybeSingle();
  if (!prompt?.current_version_id) fail(slug, "Prompt has no current version.");

  const { data: version } = await admin
    .from("prompt_versions")
    .select("available_slugs")
    .eq("id", prompt.current_version_id)
    .maybeSingle();

  const declared: string[] = Array.isArray(version?.available_slugs) ? version!.available_slugs : [];
  const vars: Record<string, string> = {};
  for (const s of declared) {
    vars[s] = String(formData.get(`var_${s}`) ?? "");
  }

  const result = await llmCall(slug, vars, { isTest: true, actorId: user.id });
  if (!result.ok) {
    fail(slug, `Test failed: ${result.error}`);
  }
  redirect(
    `/admin/prompts/${slug}?ok=${encodeURIComponent(
      `Test ok (${result.modelUsed}${result.wasFallback > 0 ? ` · fallback ${result.wasFallback}` : ""})`
    )}&test_output=${encodeURIComponent(result.text.slice(0, 8000))}`
  );
}
